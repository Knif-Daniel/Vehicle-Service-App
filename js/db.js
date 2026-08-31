/* Datenhaltung: Fahrzeuge & Serviceeinträge, verschlüsselt (AES-GCM) in localStorage abgelegt.
   Nur wer das Passwort kennt, kann die Daten entschlüsseln - siehe js/crypto.js. */
const DB = (() => {
  const STORAGE_KEY = 'fahrzeug-service-enc-v1';
  const SESSION_KEY = 'fahrzeug-service-session-v1';

  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function readEnvelope() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Envelope lesen fehlgeschlagen', e);
      return null;
    }
  }

  function writeEnvelope(envelope) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  }

  let state = { vehicles: [], entries: [] };
  let cryptoKey = null; // { key: CryptoKey, saltB64 }
  let pendingPush = false;
  let onSyncError = null;

  // Schreibt den verschlüsselten Datensatz zu GitHub (falls angemeldet). Legt beim allerersten
  // Mal einen neuen privaten Gist an, danach wird derselbe Gist aktualisiert.
  async function pushToRemote(envelope) {
    if (typeof GitHubAuth === 'undefined' || !GitHubAuth.isLoggedIn()) return;
    try {
      const token = GitHubAuth.getToken();
      const contentStr = JSON.stringify(envelope);
      let gistId = GitHubAuth.getGistId();
      if (!gistId) {
        gistId = await GitHubSync.createGist(token, contentStr);
        GitHubAuth.setGistId(gistId);
      } else {
        await GitHubSync.updateGist(token, gistId, contentStr);
      }
      pendingPush = false;
    } catch (e) {
      pendingPush = true;
      console.warn('Push zu GitHub fehlgeschlagen', e);
      if (typeof onSyncError === 'function') onSyncError(e);
    }
  }

  // Persist-Aufrufe werden verkettet, damit parallele Speichervorgänge sich nicht
  // gegenseitig mit veraltetem Stand überschreiben (jeder Lauf liest den aktuellen `state`).
  let persistChain = Promise.resolve();
  function persist() {
    if (!cryptoKey) return persistChain;
    persistChain = persistChain
      .then(async () => {
        const { iv, data } = await AppCrypto.encrypt(cryptoKey.key, JSON.stringify(state));
        const envelope = { v: 1, salt: cryptoKey.saltB64, iv, data, updatedAt: new Date().toISOString() };
        writeEnvelope(envelope);
        await pushToRemote(envelope);
      })
      .catch((e) => console.error('Speichern fehlgeschlagen', e));
    return persistChain;
  }

  async function cacheSession() {
    try {
      const rawKey = await AppCrypto.exportRawKey(cryptoKey.key);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ rawKey, saltB64: cryptoKey.saltB64 }));
    } catch (e) {
      console.warn('Session-Cache fehlgeschlagen', e);
    }
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  return {
    SERVICE_TYPES: [
      'Ölwechsel',
      'Pickerl / TÜV / HU',
      'Inspektion',
      'Bremsen',
      'Reifenwechsel',
      'Batterie',
      'Zahnriemen / Steuerkette',
      'Kühlmittel',
      'Luftfilter',
      'Sonstiges',
    ],

    VEHICLE_TYPES: ['PKW', 'Motorrad', 'Nutzfahrzeug', 'Maschine / Gerät', 'Sonstiges'],

    // ---- Verschlüsselung / Zugriff ----
    hasData() {
      return !!readEnvelope();
    },

    isUnlocked() {
      return !!cryptoKey;
    },

    hasPendingPush() {
      return pendingPush;
    },

    setSyncErrorHandler(fn) {
      onSyncError = fn;
    },

    // Roh-Envelope lesen/schreiben, ohne zu entschlüsseln - für den Sync-Abgleich vor dem Entsperren.
    peekLocalEnvelope() {
      return readEnvelope();
    },

    writeLocalEnvelope(envelope) {
      writeEnvelope(envelope);
    },

    // Holt den aktuellen Stand aus dem GitHub-Gist und übernimmt ihn lokal, falls er neuer ist
    // als der lokale Cache (oder lokal noch gar nichts vorhanden ist). Wirft bei Netzwerkfehlern,
    // damit der Aufrufer bei Bedarf auf den lokalen Stand zurückfallen kann.
    async pullFromRemote() {
      if (typeof GitHubAuth === 'undefined' || !GitHubAuth.isLoggedIn()) return false;
      const token = GitHubAuth.getToken();
      let gistId = GitHubAuth.getGistId();
      if (!gistId) {
        gistId = await GitHubSync.findDataGist(token);
        if (gistId) GitHubAuth.setGistId(gistId);
      }
      if (!gistId) return false; // noch nichts remote vorhanden (neuer Account)
      const contentStr = await GitHubSync.fetchGistContent(token, gistId);
      const remoteEnvelope = JSON.parse(contentStr);
      const localEnvelope = readEnvelope();
      if (!localEnvelope || (remoteEnvelope.updatedAt || '') > (localEnvelope.updatedAt || '')) {
        writeEnvelope(remoteEnvelope);
        return true;
      }
      return false;
    },

    async retryPush() {
      const envelope = readEnvelope();
      if (envelope && pendingPush) await pushToRemote(envelope);
    },

    // Erzwingt einen Push des aktuellen lokalen Stands, unabhängig vom pendingPush-Flag
    // (für den "Jetzt synchronisieren"-Button).
    async forcePush() {
      const envelope = readEnvelope();
      if (envelope) await pushToRemote(envelope);
    },

    async setup(password) {
      cryptoKey = await AppCrypto.deriveKey(password);
      state = { vehicles: [], entries: [] };
      await persist();
      await cacheSession();
    },

    async unlock(password) {
      const envelope = readEnvelope();
      if (!envelope) throw new Error('Keine Daten vorhanden');
      const derived = await AppCrypto.deriveKey(password, envelope.salt);
      const plaintext = await AppCrypto.decrypt(derived.key, envelope.iv, envelope.data); // wirft bei falschem Passwort
      const data = JSON.parse(plaintext);
      state = {
        vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
        entries: Array.isArray(data.entries) ? data.entries : [],
      };
      cryptoKey = derived;
      await cacheSession();
      pushToRemote(envelope); // stellt sicher, dass z. B. ein frisch importierter Stand auch remote landet
    },

    // Versucht, eine zwischengespeicherte Sitzung (sessionStorage) ohne erneute Passworteingabe zu entsperren.
    async tryResumeSession() {
      const cached = sessionStorage.getItem(SESSION_KEY);
      const envelope = readEnvelope();
      if (!cached || !envelope) return false;
      try {
        const { rawKey, saltB64 } = JSON.parse(cached);
        if (saltB64 !== envelope.salt) throw new Error('Salt geändert');
        const key = await AppCrypto.importRawKey(rawKey);
        const plaintext = await AppCrypto.decrypt(key, envelope.iv, envelope.data);
        const data = JSON.parse(plaintext);
        state = {
          vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
          entries: Array.isArray(data.entries) ? data.entries : [],
        };
        cryptoKey = { key, saltB64 };
        return true;
      } catch (e) {
        clearSession();
        return false;
      }
    },

    async changePassword(oldPassword, newPassword) {
      const envelope = readEnvelope();
      if (!envelope) throw new Error('Keine Daten vorhanden');
      const oldDerived = await AppCrypto.deriveKey(oldPassword, envelope.salt);
      await AppCrypto.decrypt(oldDerived.key, envelope.iv, envelope.data); // wirft bei falschem Passwort
      cryptoKey = await AppCrypto.deriveKey(newPassword); // neues Salt
      await persist();
      await cacheSession();
    },

    lock() {
      cryptoKey = null;
      state = { vehicles: [], entries: [] };
      clearSession();
    },

    // Löscht auch den Remote-Gist (falls angemeldet) - sonst würde der nächste Sync die alten,
    // nicht mehr entschlüsselbaren Daten wieder zurückholen.
    async resetAll() {
      if (typeof GitHubAuth !== 'undefined' && GitHubAuth.isLoggedIn()) {
        const gistId = GitHubAuth.getGistId();
        if (gistId) {
          try {
            await GitHubSync.deleteGist(GitHubAuth.getToken(), gistId);
          } catch (e) {
            console.warn('Remote-Gist konnte nicht gelöscht werden', e);
          }
          GitHubAuth.clearGistId();
        }
      }
      localStorage.removeItem(STORAGE_KEY);
      cryptoKey = null;
      state = { vehicles: [], entries: [] };
      clearSession();
    },

    // ---- Vehicles ----
    getVehicles() {
      return [...state.vehicles].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },

    getVehicle(id) {
      return state.vehicles.find((v) => v.id === id) || null;
    },

    addVehicle(data) {
      const vehicle = {
        id: uid(),
        name: data.name.trim(),
        type: data.type || 'PKW',
        brand: (data.brand || '').trim(),
        year: data.year ? Number(data.year) : null,
        licensePlate: (data.licensePlate || '').trim(),
        currentKm: data.currentKm !== '' && data.currentKm != null ? Number(data.currentKm) : null,
        currentHours: data.currentHours !== '' && data.currentHours != null ? Number(data.currentHours) : null,
        notes: (data.notes || '').trim(),
        createdAt: new Date().toISOString(),
      };
      state.vehicles.push(vehicle);
      persist();
      return vehicle;
    },

    updateVehicle(id, data) {
      const vehicle = this.getVehicle(id);
      if (!vehicle) return null;
      Object.assign(vehicle, {
        name: data.name.trim(),
        type: data.type || 'PKW',
        brand: (data.brand || '').trim(),
        year: data.year ? Number(data.year) : null,
        licensePlate: (data.licensePlate || '').trim(),
        currentKm: data.currentKm !== '' && data.currentKm != null ? Number(data.currentKm) : null,
        currentHours: data.currentHours !== '' && data.currentHours != null ? Number(data.currentHours) : null,
        notes: (data.notes || '').trim(),
      });
      persist();
      return vehicle;
    },

    deleteVehicle(id) {
      state.vehicles = state.vehicles.filter((v) => v.id !== id);
      state.entries = state.entries.filter((e) => e.vehicleId !== id);
      persist();
    },

    // ---- Service entries ----
    getEntries(vehicleId) {
      return state.entries
        .filter((e) => e.vehicleId === vehicleId)
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
    },

    getEntry(id) {
      return state.entries.find((e) => e.id === id) || null;
    },

    addEntry(vehicleId, data) {
      const entry = {
        id: uid(),
        vehicleId,
        date: data.date || new Date().toISOString().slice(0, 10),
        serviceType: data.serviceType || 'Sonstiges',
        customType: (data.customType || '').trim(),
        km: data.km !== '' && data.km != null ? Number(data.km) : null,
        hours: data.hours !== '' && data.hours != null ? Number(data.hours) : null,
        cost: data.cost !== '' && data.cost != null ? Number(data.cost) : null,
        nextDueKm: data.nextDueKm !== '' && data.nextDueKm != null ? Number(data.nextDueKm) : null,
        nextDueDate: data.nextDueDate || null,
        comment: (data.comment || '').trim(),
        createdAt: new Date().toISOString(),
      };
      state.entries.push(entry);

      // Kilometerstand / Betriebsstunden des Fahrzeugs bei Bedarf aktualisieren
      const vehicle = this.getVehicle(vehicleId);
      if (vehicle) {
        if (entry.km != null && (vehicle.currentKm == null || entry.km > vehicle.currentKm)) {
          vehicle.currentKm = entry.km;
        }
        if (entry.hours != null && (vehicle.currentHours == null || entry.hours > vehicle.currentHours)) {
          vehicle.currentHours = entry.hours;
        }
      }

      persist();
      return entry;
    },

    updateEntry(id, data) {
      const entry = this.getEntry(id);
      if (!entry) return null;
      Object.assign(entry, {
        date: data.date || entry.date,
        serviceType: data.serviceType || 'Sonstiges',
        customType: (data.customType || '').trim(),
        km: data.km !== '' && data.km != null ? Number(data.km) : null,
        hours: data.hours !== '' && data.hours != null ? Number(data.hours) : null,
        cost: data.cost !== '' && data.cost != null ? Number(data.cost) : null,
        nextDueKm: data.nextDueKm !== '' && data.nextDueKm != null ? Number(data.nextDueKm) : null,
        nextDueDate: data.nextDueDate || null,
        comment: (data.comment || '').trim(),
      });
      persist();
      return entry;
    },

    deleteEntry(id) {
      state.entries = state.entries.filter((e) => e.id !== id);
      persist();
    },

    // ---- Fällige Services über alle Fahrzeuge (fürs Dashboard) ----
    getUpcoming() {
      const today = new Date().toISOString().slice(0, 10);
      const items = [];
      for (const entry of state.entries) {
        if (!entry.nextDueKm && !entry.nextDueDate) continue;
        const vehicle = this.getVehicle(entry.vehicleId);
        if (!vehicle) continue;
        let overdue = false;
        let dueKmRemaining = null;
        if (entry.nextDueKm != null && vehicle.currentKm != null) {
          dueKmRemaining = entry.nextDueKm - vehicle.currentKm;
          if (dueKmRemaining <= 0) overdue = true;
        }
        let dueDateOverdue = false;
        if (entry.nextDueDate && entry.nextDueDate <= today) {
          dueDateOverdue = true;
        }
        items.push({
          entry,
          vehicle,
          overdue: overdue || dueDateOverdue,
          dueKmRemaining,
        });
      }
      return items.sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1));
    },

    // ---- Backup ----
    // Exportiert den bereits verschlüsselten Rohbestand - unbedenklich für ein öffentliches
    // Repo/Backup, da ohne Passwort nicht lesbar. Funktioniert auch im gesperrten Zustand.
    exportData() {
      const envelope = readEnvelope();
      if (!envelope) throw new Error('Keine Daten vorhanden');
      return JSON.stringify(envelope, null, 2);
    },

    // Importiert einen verschlüsselten Rohbestand (z. B. aus exportData). Sperrt die App
    // anschließend, da der Import ein anderes Passwort/Salt enthalten kann.
    importData(json) {
      const envelope = JSON.parse(json);
      if (!envelope || typeof envelope.salt !== 'string' || typeof envelope.iv !== 'string' || typeof envelope.data !== 'string') {
        throw new Error('Ungültiges Datenformat');
      }
      writeEnvelope(envelope);
      this.lock();
    },
  };
})();
