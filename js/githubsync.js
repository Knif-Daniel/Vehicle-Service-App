/* Cross-Device-Sync über einen privaten GitHub Gist im Konto des Nutzers.
   Der Gist enthält ausschließlich den bereits AES-verschlüsselten Datenblock (siehe js/db.js) -
   GitHub selbst bekommt das Passwort/den Klartext nie zu sehen. */
const GitHubSync = (() => {
  const API = 'https://api.github.com';
  const GIST_FILENAME = 'fahrzeug-service-data.enc.json';
  const GIST_DESCRIPTION = 'Fahrzeug Service App – verschlüsselte Fahrzeugdaten (bitte nicht manuell bearbeiten)';

  function headers(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  async function verifyToken(token) {
    const res = await fetch(`${API}/user`, { headers: headers(token) });
    if (!res.ok) {
      throw new Error(res.status === 401 ? 'Ungültiger Token.' : `GitHub nicht erreichbar (${res.status}).`);
    }
    const data = await res.json();
    return { login: data.login, id: data.id };
  }

  // Sucht unter den Gists des Nutzers nach unserer Datendatei (max. 300 Gists durchsucht).
  async function findDataGist(token) {
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`${API}/gists?per_page=100&page=${page}`, { headers: headers(token) });
      if (!res.ok) {
        throw new Error('Gists konnten nicht geladen werden (Token-Scope "gist" prüfen).');
      }
      const gists = await res.json();
      const match = gists.find((g) => g.files && g.files[GIST_FILENAME]);
      if (match) return match.id;
      if (gists.length < 100) break;
    }
    return null;
  }

  async function fetchGistContent(token, gistId) {
    const res = await fetch(`${API}/gists/${gistId}`, { headers: headers(token) });
    if (!res.ok) throw new Error('Daten konnten nicht von GitHub geladen werden.');
    const gist = await res.json();
    const file = gist.files[GIST_FILENAME];
    if (!file) throw new Error('Gist enthält keine Fahrzeugdaten.');
    if (file.truncated) {
      const raw = await fetch(file.raw_url);
      return raw.text();
    }
    return file.content;
  }

  async function createGist(token, contentStr) {
    const res = await fetch(`${API}/gists`, {
      method: 'POST',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: { [GIST_FILENAME]: { content: contentStr } },
      }),
    });
    if (!res.ok) throw new Error('Gist konnte nicht erstellt werden.');
    const gist = await res.json();
    return gist.id;
  }

  async function updateGist(token, gistId, contentStr) {
    const res = await fetch(`${API}/gists/${gistId}`, {
      method: 'PATCH',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: contentStr } } }),
    });
    if (!res.ok) throw new Error('Synchronisierung fehlgeschlagen.');
    return true;
  }

  async function deleteGist(token, gistId) {
    const res = await fetch(`${API}/gists/${gistId}`, { method: 'DELETE', headers: headers(token) });
    if (!res.ok && res.status !== 404) throw new Error('Gist konnte nicht gelöscht werden.');
    return true;
  }

  return { verifyToken, findDataGist, fetchGistContent, createGist, updateGist, deleteGist };
})();
