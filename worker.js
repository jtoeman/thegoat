/* Routing for The GOAT (Cloudflare Worker "thegoat").
   Serves the static site from the ASSETS binding. Routes: goat.froobaloo.com, thegoat.froobaloo.com, froobaloo.com/goat(/*), froobaloo.com/thegoat(/*).
   /goat/u/<name> (profile links) serves the game shell.
   Old goat.vomint.com links are redirected (301) to goat.froobaloo.com. */
const PREFIXES = ["/goat", "/thegoat"];
const NEW_HOST = "goat.froobaloo.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "vomint.com" || url.hostname.endsWith(".vomint.com")) {
      return Response.redirect(`https://${NEW_HOST}${url.pathname}${url.search}`, 301);
    }

    const prefix = PREFIXES.find(p => url.pathname === p || url.pathname.startsWith(p + "/"));
    if (prefix) {
      if (url.pathname === prefix) {
        return Response.redirect(`${url.origin}${prefix}/${url.search}`, 301);
      }
      url.pathname = url.pathname.slice(prefix.length) || "/";
      // Photos use relative paths (assets/...). On a profile page (/goat/u/<name>) the browser resolves them under /u/,
      // so serve those files from the site root instead of the game shell.
      if (url.pathname.startsWith("/u/assets/")) url.pathname = url.pathname.slice(2);
      // Profile links (/goat/u/<name>) load the game shell; the page reads the name from the URL.
      else if (url.pathname.startsWith("/u/")) url.pathname = "/";
      return env.ASSETS.fetch(new Request(url, request));
    }

    return env.ASSETS.fetch(request);
  }
};
