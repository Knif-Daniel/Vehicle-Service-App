/* UI-Logik: Routing, Rendering, Formulare */
(() => {
  const view = document.getElementById('view');
  const fabAdd = document.getElementById('fabAdd');

  const TYPE_ICONS = {
    'PKW': 'bi-car-front-fill',
    'Motorrad': 'bi-bicycle',
    'Nutzfahrzeug': 'bi-truck',
    'Maschine / Gerät': 'bi-gear-fill',
    'Sonstiges': 'bi-question-circle-fill',
  };

  const SERVICE_ICONS = {
    'Ölwechsel': 'bi-droplet-fill',
    'Pickerl / TÜV / HU': 'bi-patch-check-fill',
    'Inspektion': 'bi-clipboard2-check-fill',
    'Bremsen': 'bi-disc-fill',
    'Reifenwechsel': 'bi-circle-fill',
    'Batterie': 'bi-battery-full',
    'Zahnriemen / Steuerkette': 'bi-gear-wide-connected',
    'Kühlmittel': 'bi-thermometer-half',
    'Luftfilter': 'bi-wind',
    'Sonstiges': 'bi-wrench-adjustable-circle-fill',
  };

  // ---------- Helpers ----------
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function fmtNum(n, unit) {
    if (n == null || n === '') return '–';
    return n.toLocaleString('de-DE') + (unit ? ' ' + unit : '');
  }

  function fmtMoney(n) {
    if (n == null || n === '') return null;
    return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }

  function fmtDate(iso) {
    if (!iso) return '–';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function toast(msg) {
    const el = document.getElementById('appToast');
    document.getElementById('appToastBody').textContent = msg;
    bootstrap.Toast.getOrCreateInstance(el, { delay: 2200 }).show();
  }

  function confirmDialog(message, onConfirm, options) {
    const opts = options || {};
    const modalEl = document.getElementById('confirmModal');
    document.getElementById('confirmModalBody').textContent = message;
    const okBtn = document.getElementById('confirmModalOk');
    okBtn.textContent = opts.confirmLabel || 'Löschen';
    okBtn.className = 'btn ' + (opts.confirmClass || 'btn-danger');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const handler = () => {
      okBtn.removeEventListener('click', handler);
      modal.hide();
      onConfirm();
    };
    okBtn.addEventListener('click', handler);
    modal.show();
  }

  function entryLabel(entry) {
    if (entry.serviceType === 'Sonstiges' && entry.customType) return entry.customType;
    return entry.serviceType;
  }

  // ---------- Theme (Hell/Dunkel) ----------
  const THEME_KEY = 'fahrzeug-service-theme';
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeColorMeta = document.getElementById('themeColorMeta');

  function currentTheme() {
    return document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    themeColorMeta.setAttribute('content', theme === 'dark' ? '#0a0f1e' : '#0d6efd');
    const isDark = theme === 'dark';
    themeToggleBtn.innerHTML = `<i class="bi ${isDark ? 'bi-sun-fill' : 'bi-moon-stars-fill'} fs-5"></i>`;
    themeToggleBtn.title = isDark ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln';
  }

  applyTheme(currentTheme());

  themeToggleBtn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (ev) => {
    if (localStorage.getItem(THEME_KEY)) return; // Nutzer hat manuell gewählt
    applyTheme(ev.matches ? 'dark' : 'light');
  });

  // ---------- Router ----------
  function currentRoute() {
    const hash = location.hash.replace(/^#\/?/, '');
    if (!hash) return { name: 'dashboard' };
    const parts = hash.split('/');
    if (parts[0] === 'vehicle' && parts[1]) return { name: 'vehicle', id: parts[1] };
    return { name: 'dashboard' };
  }

  function render() {
    if (!GitHubAuth.isLoggedIn()) {
      renderLogin();
      return;
    }
    if (!DB.isUnlocked()) {
      renderUnlock();
      return;
    }
    const route = currentRoute();
    if (route.name === 'vehicle' && DB.getVehicle(route.id)) {
      renderVehicleDetail(route.id);
    } else {
      location.hash = '#/';
      renderDashboard();
    }
  }

  window.addEventListener('hashchange', render);

  // ---------- GitHub-Login / Verschlüsselung: Setup / Entsperren ----------
  function updateAuthMenu() {
    const loggedIn = GitHubAuth.isLoggedIn();
    const unlocked = DB.isUnlocked();
    document.getElementById('accountItem').classList.toggle('d-none', !loggedIn);
    document.getElementById('accountDividerItem').classList.toggle('d-none', !loggedIn);
    if (loggedIn) document.getElementById('accountUsername').textContent = GitHubAuth.getUsername() || '';
    document.getElementById('syncNowItem').classList.toggle('d-none', !(loggedIn && unlocked));
    document.getElementById('exportItem').classList.toggle('d-none', !(loggedIn && DB.hasData()));
    document.getElementById('importItem').classList.toggle('d-none', !loggedIn);
    document.getElementById('changePasswordItem').classList.toggle('d-none', !unlocked);
    document.getElementById('lockItem').classList.toggle('d-none', !unlocked);
    document.getElementById('logoutItem').classList.toggle('d-none', !loggedIn);
  }

  // Nach erfolgreichem GitHub-Login: neuesten Stand ziehen (falls vorhanden) und
  // je nachdem Setup, Entsperren oder direkt die App zeigen.
  async function proceedAfterLogin() {
    try {
      await DB.pullFromRemote();
    } catch (e) {
      console.warn('Sync beim Start fehlgeschlagen (evtl. offline):', e);
    }
    const resumed = await DB.tryResumeSession();
    if (resumed) {
      updateAuthMenu();
      render();
      return;
    }
    updateAuthMenu();
    if (DB.hasData()) {
      renderUnlock();
    } else {
      renderSetup();
    }
  }

  function renderLogin() {
    fabAdd.classList.add('d-none');
    view.innerHTML = `
    <div class="d-flex justify-content-center">
      <div class="card auth-card shadow-sm mt-4" style="max-width: 460px; width: 100%;">
        <div class="card-body p-4">
          <div class="text-center mb-3">
            <div class="auth-icon-wrap mb-3"><i class="bi bi-github fs-3"></i></div>
            <h5 class="mt-2 mb-1">Mit GitHub anmelden</h5>
            <p class="text-muted small mb-0">Deine Fahrzeugdaten werden verschlüsselt in einem privaten GitHub-Gist gespeichert, damit du von jedem Gerät mit demselben Konto darauf zugreifen kannst.</p>
          </div>
          <form id="loginForm">
            <div class="mb-2">
              <label class="form-label">GitHub Personal Access Token</label>
              <input type="password" class="form-control" id="loginToken" required autocomplete="off" placeholder="ghp_…" />
            </div>
            <div class="mb-3">
              <a href="https://github.com/settings/tokens/new?scopes=gist&description=Fahrzeug%20Service%20App" target="_blank" rel="noopener" class="small">
                <i class="bi bi-box-arrow-up-right me-1"></i>Token mit Scope „gist" erstellen
              </a>
            </div>
            <div class="alert alert-danger small py-2 d-none" id="loginError"></div>
            <div class="alert alert-secondary small py-2 mb-3">
              <i class="bi bi-info-circle me-1"></i>
              Der Token wird nur lokal in diesem Browser gespeichert und ausschließlich für Anfragen an die GitHub-API verwendet. Deine Fahrzeugdaten selbst bleiben zusätzlich durch dein eigenes App-Passwort verschlüsselt - auch bei GitHub nicht einsehbar.
            </div>
            <button type="submit" class="btn btn-primary w-100" id="loginSubmitBtn"><i class="bi bi-box-arrow-in-right me-1"></i>Anmelden</button>
          </form>
        </div>
      </div>
    </div>`;

    document.getElementById('loginForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const token = document.getElementById('loginToken').value.trim();
      const errEl = document.getElementById('loginError');
      const btn = document.getElementById('loginSubmitBtn');
      errEl.classList.add('d-none');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Anmelden…';
      try {
        await GitHubAuth.login(token);
        updateAuthMenu();
        await proceedAfterLogin();
      } catch (e) {
        errEl.textContent = e.message || 'Anmeldung fehlgeschlagen.';
        errEl.classList.remove('d-none');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i>Anmelden';
      }
    });
  }

  function renderSetup() {
    fabAdd.classList.add('d-none');
    view.innerHTML = `
    <div class="d-flex justify-content-center">
      <div class="card auth-card shadow-sm mt-4" style="max-width: 420px; width: 100%;">
        <div class="card-body p-4">
          <div class="text-center mb-3">
            <div class="auth-icon-wrap mb-3"><i class="bi bi-shield-lock fs-3"></i></div>
            <h5 class="mt-2 mb-1">Daten verschlüsseln</h5>
            <p class="text-muted small mb-0">Lege ein Passwort fest. Alle Fahrzeug- und Servicedaten werden ausschließlich lokal in deinem Browser verschlüsselt gespeichert (AES-256) - nur mit diesem Passwort lesbar.</p>
          </div>
          <form id="setupForm">
            <div class="mb-3">
              <label class="form-label">Passwort</label>
              <input type="password" class="form-control" id="setupPassword" minlength="4" required autocomplete="new-password" />
            </div>
            <div class="mb-3">
              <label class="form-label">Passwort bestätigen</label>
              <input type="password" class="form-control" id="setupPasswordConfirm" minlength="4" required autocomplete="new-password" />
            </div>
            <div class="alert alert-danger small py-2 d-none" id="setupError"></div>
            <div class="alert alert-secondary small py-2 mb-3">
              <i class="bi bi-exclamation-triangle me-1"></i>
              Es gibt keine Passwort-Wiederherstellung. Bei Verlust des Passworts sind die Daten unwiederbringlich verloren.
            </div>
            <button type="submit" class="btn btn-primary w-100"><i class="bi bi-lock-fill me-1"></i>Verschlüsseln &amp; starten</button>
          </form>
        </div>
      </div>
    </div>`;

    document.getElementById('setupForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const p1 = document.getElementById('setupPassword').value;
      const p2 = document.getElementById('setupPasswordConfirm').value;
      const errEl = document.getElementById('setupError');
      if (p1 !== p2) {
        errEl.textContent = 'Passwörter stimmen nicht überein.';
        errEl.classList.remove('d-none');
        return;
      }
      await DB.setup(p1);
      updateAuthMenu();
      render();
    });
  }

  function renderUnlock() {
    fabAdd.classList.add('d-none');
    view.innerHTML = `
    <div class="d-flex justify-content-center">
      <div class="card auth-card shadow-sm mt-4" style="max-width: 420px; width: 100%;">
        <div class="card-body p-4">
          <div class="text-center mb-3">
            <div class="auth-icon-wrap mb-3"><i class="bi bi-shield-lock fs-3"></i></div>
            <h5 class="mt-2 mb-1">Gesperrt</h5>
            <p class="text-muted small mb-0">Bitte Passwort eingeben, um die Fahrzeugdaten zu entschlüsseln.</p>
          </div>
          <form id="unlockForm">
            <div class="mb-3">
              <label class="form-label">Passwort</label>
              <input type="password" class="form-control" id="unlockPassword" required autocomplete="current-password" autofocus />
            </div>
            <div class="alert alert-danger small py-2 d-none" id="unlockError">Falsches Passwort.</div>
            <button type="submit" class="btn btn-primary w-100 mb-2"><i class="bi bi-unlock-fill me-1"></i>Entsperren</button>
            <button type="button" class="btn btn-link w-100 text-danger small" id="resetAllBtn">Passwort vergessen? Alle Daten löschen</button>
          </form>
        </div>
      </div>
    </div>`;

    document.getElementById('unlockForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const pwd = document.getElementById('unlockPassword').value;
      const errEl = document.getElementById('unlockError');
      errEl.classList.add('d-none');
      try {
        await DB.unlock(pwd);
        updateAuthMenu();
        render();
      } catch (e) {
        errEl.classList.remove('d-none');
      }
    });

    document.getElementById('resetAllBtn').addEventListener('click', () => {
      confirmDialog('Wirklich ALLE Daten unwiderruflich löschen - lokal und im GitHub-Gist? Das kann nicht rückgängig gemacht werden.', async () => {
        await DB.resetAll();
        updateAuthMenu();
        renderSetup();
      });
    });
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    fabAdd.classList.remove('d-none');
    fabAdd.title = 'Fahrzeug hinzufügen';
    fabAdd.onclick = () => openVehicleModal();

    const vehicles = DB.getVehicles();
    const upcoming = DB.getUpcoming().filter((u) => u.overdue);

    let html = '';

    if (upcoming.length) {
      html += `<div class="alert alert-danger d-flex flex-column gap-2 mb-3">
        <div class="fw-semibold"><i class="bi bi-exclamation-triangle-fill me-1"></i>Fällige Services</div>
        <div class="d-flex flex-column gap-1">
          ${upcoming
            .map(
              (u) => `
            <a href="#/vehicle/${u.vehicle.id}" class="text-decoration-none text-reset small">
              <i class="bi bi-arrow-right-short"></i>
              <strong>${esc(u.vehicle.name)}</strong> – ${esc(entryLabel(u.entry))} fällig
              ${u.entry.nextDueKm != null ? ` bei ${fmtNum(u.entry.nextDueKm, 'km')}` : ''}
              ${u.entry.nextDueDate ? ` am ${fmtDate(u.entry.nextDueDate)}` : ''}
            </a>`
            )
            .join('')}
        </div>
      </div>`;
    }

    if (!vehicles.length) {
      html += `
      <div class="empty-state">
        <div class="empty-icon-wrap"><i class="bi bi-car-front"></i></div>
        <p class="mt-3 mb-1 fw-semibold">Noch keine Fahrzeuge</p>
        <p class="mb-3">Füge dein erstes Fahrzeug hinzu, um Services zu protokollieren.</p>
        <button class="btn btn-primary" id="emptyAddVehicleBtn"><i class="bi bi-plus-lg me-1"></i>Fahrzeug hinzufügen</button>
      </div>`;
    } else {
      html += '<div class="row g-3">';
      for (const v of vehicles) {
        const entries = DB.getEntries(v.id);
        const last = entries[0];
        html += `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="card vehicle-card h-100 shadow-sm" data-id="${v.id}">
            <div class="card-body d-flex gap-3">
              <div class="card-icon"><i class="bi ${TYPE_ICONS[v.type] || TYPE_ICONS['Sonstiges']}"></i></div>
              <div class="flex-grow-1 min-w-0">
                <h5 class="card-title mb-0 text-truncate">${esc(v.name)}</h5>
                <div class="text-muted small text-truncate">${esc(v.brand || '')}${v.year ? ' · BJ ' + v.year : ''}</div>
                <div class="d-flex flex-wrap gap-2 mt-2">
                  ${v.currentKm != null ? `<span class="badge bg-body-secondary text-body border">${fmtNum(v.currentKm, 'km')}</span>` : ''}
                  ${v.currentHours != null ? `<span class="badge bg-body-secondary text-body border">${fmtNum(v.currentHours, 'h')}</span>` : ''}
                  ${v.licensePlate ? `<span class="badge bg-body-secondary text-body border">${esc(v.licensePlate)}</span>` : ''}
                </div>
                <div class="text-muted small mt-2">
                  ${last ? `Letzter Service: ${esc(entryLabel(last))} · ${fmtDate(last.date)}` : 'Noch kein Service erfasst'}
                </div>
              </div>
            </div>
          </div>
        </div>`;
      }
      html += '</div>';
    }

    view.innerHTML = html;

    view.querySelectorAll('.vehicle-card').forEach((card) => {
      card.addEventListener('click', () => {
        location.hash = '#/vehicle/' + card.dataset.id;
      });
    });

    const emptyBtn = document.getElementById('emptyAddVehicleBtn');
    if (emptyBtn) emptyBtn.addEventListener('click', () => openVehicleModal());
  }

  // ---------- Fahrzeug-Detail ----------
  function renderVehicleDetail(id) {
    const vehicle = DB.getVehicle(id);
    if (!vehicle) {
      location.hash = '#/';
      return;
    }

    fabAdd.classList.remove('d-none');
    fabAdd.title = 'Service-Eintrag hinzufügen';
    fabAdd.onclick = () => openEntryModal(vehicle.id);

    const entries = DB.getEntries(vehicle.id);
    const today = new Date().toISOString().slice(0, 10);

    let html = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <a href="#/" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-left"></i></a>
      <h4 class="mb-0 flex-grow-1 text-truncate">${esc(vehicle.name)}</h4>
      <div class="dropdown">
        <button class="btn btn-sm btn-outline-secondary" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
        <ul class="dropdown-menu dropdown-menu-end">
          <li><button class="dropdown-item" id="editVehicleBtn"><i class="bi bi-pencil me-2"></i>Bearbeiten</button></li>
          <li><button class="dropdown-item text-danger" id="deleteVehicleBtn"><i class="bi bi-trash me-2"></i>Fahrzeug löschen</button></li>
        </ul>
      </div>
    </div>

    <div class="card shadow-sm mb-3">
      <div class="card-body">
        <div class="row row-cols-2 row-cols-md-4 g-3 text-center">
          <div class="col"><div class="text-muted small">Typ</div><div class="fw-semibold">${esc(vehicle.type)}</div></div>
          <div class="col"><div class="text-muted small">Baujahr</div><div class="fw-semibold">${vehicle.year || '–'}</div></div>
          <div class="col"><div class="text-muted small">Kilometerstand</div><div class="fw-semibold">${fmtNum(vehicle.currentKm, 'km')}</div></div>
          <div class="col"><div class="text-muted small">Betriebsstunden</div><div class="fw-semibold">${fmtNum(vehicle.currentHours, 'h')}</div></div>
        </div>
        ${
          vehicle.brand || vehicle.licensePlate || vehicle.notes
            ? `<hr/>
        <div class="d-flex flex-wrap gap-3 small">
          ${vehicle.brand ? `<div><span class="text-muted">Marke/Modell:</span> ${esc(vehicle.brand)}</div>` : ''}
          ${vehicle.licensePlate ? `<div><span class="text-muted">Kennzeichen:</span> ${esc(vehicle.licensePlate)}</div>` : ''}
        </div>
        ${vehicle.notes ? `<div class="small mt-2"><span class="text-muted">Notizen:</span> ${esc(vehicle.notes)}</div>` : ''}`
            : ''
        }
      </div>
    </div>

    <h6 class="text-muted text-uppercase small mb-2">Service-Verlauf</h6>
    `;

    if (!entries.length) {
      html += `
      <div class="empty-state">
        <div class="empty-icon-wrap"><i class="bi bi-clipboard2-x"></i></div>
        <p class="mt-3 mb-1 fw-semibold">Noch keine Einträge</p>
        <p class="mb-3">Erfasse den ersten Service für dieses Fahrzeug.</p>
        <button class="btn btn-primary" id="emptyAddEntryBtn"><i class="bi bi-plus-lg me-1"></i>Service-Eintrag hinzufügen</button>
      </div>`;
    } else {
      html += '<div class="list-group shadow-sm mb-3">';
      for (const e of entries) {
        const overdueKm = e.nextDueKm != null && vehicle.currentKm != null && e.nextDueKm <= vehicle.currentKm;
        const overdueDate = e.nextDueDate && e.nextDueDate <= today;
        const overdue = overdueKm || overdueDate;
        const money = fmtMoney(e.cost);
        html += `
        <div class="list-group-item entry-item" data-id="${e.id}">
          <div class="d-flex gap-3">
            <div class="entry-icon"><i class="bi ${SERVICE_ICONS[e.serviceType] || SERVICE_ICONS['Sonstiges']}"></i></div>
            <div class="flex-grow-1 min-w-0">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div class="fw-semibold">${esc(entryLabel(e))}</div>
                <div class="text-muted small text-nowrap">${fmtDate(e.date)}</div>
              </div>
              <div class="d-flex flex-wrap gap-2 mt-1">
                ${e.km != null ? `<span class="badge bg-body-secondary text-body border">${fmtNum(e.km, 'km')}</span>` : ''}
                ${e.hours != null ? `<span class="badge bg-body-secondary text-body border">${fmtNum(e.hours, 'h')}</span>` : ''}
                ${money ? `<span class="badge bg-body-secondary text-body border">${money}</span>` : ''}
                ${
                  e.nextDueKm != null || e.nextDueDate
                    ? `<span class="badge ${overdue ? 'due-badge-overdue' : 'due-badge-ok'}">
                        <i class="bi ${overdue ? 'bi-exclamation-triangle' : 'bi-clock-history'}"></i>
                        fällig ${e.nextDueKm != null ? fmtNum(e.nextDueKm, 'km') : ''}${e.nextDueKm != null && e.nextDueDate ? ' / ' : ''}${e.nextDueDate ? fmtDate(e.nextDueDate) : ''}
                       </span>`
                    : ''
                }
              </div>
              ${e.comment ? `<div class="small text-muted mt-2">${esc(e.comment)}</div>` : ''}
              <div class="mt-2">
                <button class="btn btn-sm btn-outline-secondary entry-edit-btn"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger entry-delete-btn"><i class="bi bi-trash"></i></button>
              </div>
            </div>
          </div>
        </div>`;
      }
      html += '</div>';
    }

    view.innerHTML = html;

    document.getElementById('editVehicleBtn').addEventListener('click', () => openVehicleModal(vehicle.id));
    document.getElementById('deleteVehicleBtn').addEventListener('click', () => {
      confirmDialog(`"${vehicle.name}" inkl. aller Service-Einträge löschen?`, () => {
        DB.deleteVehicle(vehicle.id);
        toast('Fahrzeug gelöscht.');
        location.hash = '#/';
      });
    });

    const emptyEntryBtn = document.getElementById('emptyAddEntryBtn');
    if (emptyEntryBtn) emptyEntryBtn.addEventListener('click', () => openEntryModal(vehicle.id));

    view.querySelectorAll('.entry-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('.entry-item').dataset.id;
        openEntryModal(vehicle.id, id);
      });
    });
    view.querySelectorAll('.entry-delete-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('.entry-item').dataset.id;
        confirmDialog('Diesen Service-Eintrag löschen?', () => {
          DB.deleteEntry(id);
          toast('Eintrag gelöscht.');
          renderVehicleDetail(vehicle.id);
        });
      });
    });
  }

  // ---------- Fahrzeug-Modal ----------
  const vehicleModalEl = document.getElementById('vehicleModal');
  const vehicleModal = new bootstrap.Modal(vehicleModalEl);
  const vehicleForm = document.getElementById('vehicleForm');
  const vehicleTypeSelect = document.getElementById('vehicleType');

  DB.VEHICLE_TYPES.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    vehicleTypeSelect.appendChild(opt);
  });

  function openVehicleModal(id) {
    vehicleForm.reset();
    const vehicle = id ? DB.getVehicle(id) : null;
    document.getElementById('vehicleModalTitle').textContent = vehicle ? 'Fahrzeug bearbeiten' : 'Fahrzeug hinzufügen';
    document.getElementById('vehicleId').value = vehicle ? vehicle.id : '';
    document.getElementById('vehicleName').value = vehicle ? vehicle.name : '';
    document.getElementById('vehicleType').value = vehicle ? vehicle.type : 'PKW';
    document.getElementById('vehicleYear').value = vehicle && vehicle.year != null ? vehicle.year : '';
    document.getElementById('vehicleBrand').value = vehicle ? vehicle.brand : '';
    document.getElementById('vehicleLicensePlate').value = vehicle ? vehicle.licensePlate : '';
    document.getElementById('vehicleKm').value = vehicle && vehicle.currentKm != null ? vehicle.currentKm : '';
    document.getElementById('vehicleHours').value = vehicle && vehicle.currentHours != null ? vehicle.currentHours : '';
    document.getElementById('vehicleNotes').value = vehicle ? vehicle.notes : '';
    vehicleModal.show();
  }

  vehicleForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const id = document.getElementById('vehicleId').value;
    const data = {
      name: document.getElementById('vehicleName').value,
      type: document.getElementById('vehicleType').value,
      year: document.getElementById('vehicleYear').value,
      brand: document.getElementById('vehicleBrand').value,
      licensePlate: document.getElementById('vehicleLicensePlate').value,
      currentKm: document.getElementById('vehicleKm').value,
      currentHours: document.getElementById('vehicleHours').value,
      notes: document.getElementById('vehicleNotes').value,
    };
    if (!data.name.trim()) return;

    let vehicle;
    if (id) {
      vehicle = DB.updateVehicle(id, data);
      toast('Fahrzeug aktualisiert.');
    } else {
      vehicle = DB.addVehicle(data);
      toast('Fahrzeug hinzugefügt.');
    }
    vehicleModal.hide();
    if (currentRoute().name === 'vehicle') {
      renderVehicleDetail(vehicle.id);
    } else {
      renderDashboard();
    }
  });

  // ---------- Service-Eintrag-Modal ----------
  const entryModalEl = document.getElementById('entryModal');
  const entryModal = new bootstrap.Modal(entryModalEl);
  const entryForm = document.getElementById('entryForm');
  const entryServiceTypeSelect = document.getElementById('entryServiceType');
  const entryCustomTypeWrap = document.getElementById('entryCustomTypeWrap');

  DB.SERVICE_TYPES.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    entryServiceTypeSelect.appendChild(opt);
  });

  function updateCustomTypeVisibility() {
    entryCustomTypeWrap.classList.toggle('d-none', entryServiceTypeSelect.value !== 'Sonstiges');
  }
  entryServiceTypeSelect.addEventListener('change', updateCustomTypeVisibility);

  function openEntryModal(vehicleId, entryId) {
    entryForm.reset();
    const entry = entryId ? DB.getEntry(entryId) : null;
    document.getElementById('entryModalTitle').textContent = entry ? 'Service-Eintrag bearbeiten' : 'Service-Eintrag hinzufügen';
    document.getElementById('entryId').value = entry ? entry.id : '';
    document.getElementById('entryVehicleId').value = vehicleId;
    document.getElementById('entryServiceType').value = entry ? entry.serviceType : DB.SERVICE_TYPES[0];
    document.getElementById('entryCustomType').value = entry ? entry.customType : '';
    document.getElementById('entryDate').value = entry ? entry.date : new Date().toISOString().slice(0, 10);
    document.getElementById('entryKm').value = entry && entry.km != null ? entry.km : '';
    document.getElementById('entryHours').value = entry && entry.hours != null ? entry.hours : '';
    document.getElementById('entryCost').value = entry && entry.cost != null ? entry.cost : '';
    document.getElementById('entryNextDueKm').value = entry && entry.nextDueKm != null ? entry.nextDueKm : '';
    document.getElementById('entryNextDueDate').value = entry && entry.nextDueDate ? entry.nextDueDate : '';
    document.getElementById('entryComment').value = entry ? entry.comment : '';
    updateCustomTypeVisibility();
    entryModal.show();
  }

  entryForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const id = document.getElementById('entryId').value;
    const vehicleId = document.getElementById('entryVehicleId').value;
    const data = {
      serviceType: document.getElementById('entryServiceType').value,
      customType: document.getElementById('entryCustomType').value,
      date: document.getElementById('entryDate').value,
      km: document.getElementById('entryKm').value,
      hours: document.getElementById('entryHours').value,
      cost: document.getElementById('entryCost').value,
      nextDueKm: document.getElementById('entryNextDueKm').value,
      nextDueDate: document.getElementById('entryNextDueDate').value,
      comment: document.getElementById('entryComment').value,
    };

    if (id) {
      DB.updateEntry(id, data);
      toast('Eintrag aktualisiert.');
    } else {
      DB.addEntry(vehicleId, data);
      toast('Eintrag hinzugefügt.');
    }
    entryModal.hide();
    renderVehicleDetail(vehicleId);
  });

  // ---------- Sperren / Abmelden / Passwort ändern ----------
  document.getElementById('lockBtn').addEventListener('click', () => {
    DB.lock();
    updateAuthMenu();
    location.hash = '#/';
    renderUnlock();
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    confirmDialog(
      'Von GitHub abmelden? Deine Daten bleiben sicher im GitHub-Gist gespeichert und sind nach erneuter Anmeldung wieder da.',
      () => {
        DB.lock();
        GitHubAuth.logout();
        updateAuthMenu();
        location.hash = '#/';
        renderLogin();
      },
      { confirmLabel: 'Abmelden', confirmClass: 'btn-primary' }
    );
  });

  document.getElementById('syncNowBtn').addEventListener('click', async () => {
    try {
      const remoteWasNewer = await DB.pullFromRemote();
      if (remoteWasNewer) {
        DB.lock();
        updateAuthMenu();
        toast('Neuerer Stand von einem anderen Gerät gefunden - bitte Passwort erneut eingeben.');
        location.hash = '#/';
        renderUnlock();
        return;
      }
      await DB.forcePush();
      toast('Synchronisiert.');
    } catch (e) {
      toast('Synchronisierung fehlgeschlagen (offline?).');
    }
  });

  const changePasswordModalEl = document.getElementById('changePasswordModal');
  const changePasswordModal = new bootstrap.Modal(changePasswordModalEl);
  document.getElementById('changePasswordBtn').addEventListener('click', () => {
    document.getElementById('changePasswordForm').reset();
    document.getElementById('cpError').classList.add('d-none');
    changePasswordModal.show();
  });
  document.getElementById('changePasswordForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const oldPwd = document.getElementById('cpOldPassword').value;
    const newPwd = document.getElementById('cpNewPassword').value;
    const newPwd2 = document.getElementById('cpNewPasswordConfirm').value;
    const errEl = document.getElementById('cpError');
    errEl.classList.add('d-none');
    if (newPwd !== newPwd2) {
      errEl.textContent = 'Neue Passwörter stimmen nicht überein.';
      errEl.classList.remove('d-none');
      return;
    }
    try {
      await DB.changePassword(oldPwd, newPwd);
      changePasswordModal.hide();
      toast('Passwort geändert.');
    } catch (e) {
      errEl.textContent = 'Aktuelles Passwort ist falsch.';
      errEl.classList.remove('d-none');
    }
  });

  // ---------- Export / Import (nur angemeldet) ----------
  document.getElementById('exportBtn').addEventListener('click', () => {
    if (!GitHubAuth.isLoggedIn()) return;
    let json;
    try {
      json = DB.exportData();
    } catch (e) {
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fahrzeug-service-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Verschlüsseltes Backup exportiert.');
  });

  const importFile = document.getElementById('importFile');
  document.getElementById('importBtn').addEventListener('click', () => {
    if (!GitHubAuth.isLoggedIn()) return;
    importFile.click();
  });
  importFile.addEventListener('change', () => {
    const file = importFile.files[0];
    if (!file || !GitHubAuth.isLoggedIn()) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        DB.importData(reader.result);
        toast('Backup importiert. Bitte Passwort eingeben.');
        updateAuthMenu();
        renderUnlock();
      } catch (e) {
        alert('Import fehlgeschlagen: Ungültige oder beschädigte Datei.');
      } finally {
        importFile.value = '';
      }
    };
    reader.readAsText(file);
  });

  // ---------- Sync-Fehler & Wiederherstellung ----------
  DB.setSyncErrorHandler(() => {
    toast('Synchronisierung fehlgeschlagen - wird beim nächsten Mal erneut versucht.');
  });

  window.addEventListener('online', () => {
    if (DB.isUnlocked()) DB.retryPush();
  });

  // ---------- Start ----------
  (async function boot() {
    updateAuthMenu();
    if (!GitHubAuth.isLoggedIn()) {
      renderLogin();
      return;
    }
    await proceedAfterLogin();
  })();

  // ---------- Service Worker (PWA offline) ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch((err) => {
        console.warn('Service Worker Registrierung fehlgeschlagen:', err);
      });
    });
  }
})();
