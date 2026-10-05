'use strict';

// Tiny router supporting path patterns like '/task/:id'.
class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler, options = {}) {
    const keys = [];
    // (1) escape regex metacharacters, (2) turn ':name' into a capture group '([^/]+)'
    const source = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:[^/]+/g, (match) => {
        keys.push(match.slice(1)); // drop the ':' -> param name
        return '([^/]+)';
      });

    this.routes.push({
      method,
      regex: new RegExp(`^${source}/?$`), // anchored, optional trailing
      keys,
      handler,
      public: options.public === true // public route -> skip auth
    });
  }

  get(pattern, handler, options) {
    this.add('GET', pattern, handler, options);
  }

  post(pattern, handler, options) {
    this.add('POST', pattern, handler, options);
  }

  patch(pattern, handler, options) {
    this.add('PATCH', pattern, handler, options);
  }

  delete(pattern, handler, options) {
    this.add('DELETE', pattern, handler, options);
  }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const found = pathname.match(route.regex); // String.match: run the anchored regex
      if (!found) continue;

      const params = {};
      // found[0] is the whole match -> captures start at index 1
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(found[index + 1]);
      });
      return { handler: route.handler, params, public: route.public };
    }
    return null;
  }

  // match path against ANY method -> distinguish 405 (wrong method) from 404 (wrong path)
  pathExists(pathname) {
    return this.routes.some((route) => route.regex.test(pathname)); // RegExp.test: boolean match, no captures
  }
}

module.exports = { Router };
