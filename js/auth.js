/* Verwaltet den GitHub-Login-Zustand (Token/Benutzername/Gist-ID) lokal im Browser. */
const GitHubAuth = (() => {
  const TOKEN_KEY = 'fahrzeug-service-gh-token';
  const USER_KEY = 'fahrzeug-service-gh-user';
  const GIST_KEY = 'fahrzeug-service-gh-gistid';

  return {
    isLoggedIn() {
      return !!localStorage.getItem(TOKEN_KEY);
    },

    getToken() {
      return localStorage.getItem(TOKEN_KEY);
    },

    getUsername() {
      return localStorage.getItem(USER_KEY);
    },

    getGistId() {
      return localStorage.getItem(GIST_KEY);
    },

    setGistId(id) {
      localStorage.setItem(GIST_KEY, id);
    },

    clearGistId() {
      localStorage.removeItem(GIST_KEY);
    },

    // Prüft den Token bei GitHub und merkt sich Token + Benutzername lokal.
    async login(token) {
      const info = await GitHubSync.verifyToken(token);
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, info.login);
      return info.login;
    },

    // Meldet nur dieses Gerät ab - die Daten bleiben unverändert im GitHub-Gist erhalten.
    logout() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(GIST_KEY);
    },
  };
})();
