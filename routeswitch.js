"use strict";
if (!Promise) {
    // Make sure we have a Promise implementation even on node <= 0.10
    require('es6-shim');
}
var fs = require('fs');
var Path = require('Path');
var readdir = function(dir) {
    return new Promise(function(resolve, reject) {
        var cb = function(err, res) {
            if (err) { reject(err); }
            else { resolve(res); }
        };
        return fs.readdir(dir, cb);
    });
};
var RU = require('regexp-utils');

function naiveRFC6570ToRegExp (path) {
    // We only support simple variable names for now
    var keys = [];
    var re = RU.escapeRegExp(path)
            // Braces are escaped here; literal braces are expected to be
            // percent-encoded in the passed-in path.
            .replace(/\\{([a-zA-Z0-9]+)\\}/g, function(_, key) {
        keys.push(key);
        return '([^\/]+)';
    });
    return {
        regexp: new RegExp('^' + re + '$'),
        keys: keys
    };
}

// Convert a route into a matcher object
function routeToMatcher (route) {
    var pattern = route.pattern,
        keys = [];
    if (pattern && pattern.constructor === String) {
        var pathMatcher = naiveRFC6570ToRegExp(pattern);
        keys = pathMatcher.keys;
        pattern = pathMatcher.regexp;
    }

    return {
        pattern: pattern,
        keys: keys,
        route: route
    };
}

/**
 * Simple request router using regexp-utils
 *
 * Route is expected to be an object like this:
 * {
 *      pattern: '/{title}/{part}', // path pattern in RFC6570 syntax
 *      value: {} // arbitrary object, returned on match
 * }
 *
 * Return value:
 * {
 *      route: { // original route object
 *          pattern: '/{title}/{part}', // path pattern in RFC6570 syntax
 *          value: {} // arbitrary object, returned on match
 *      },
 *      path: '/some title/some part', // the passed-in path
 *      params: { // path parameters
 *          title: "some title",
 *          part: "some part"
 *      },
 *      query: { } // query parameters
 * }
 *
                newMatch.index = match.index;
                newMatch.input = s;
 */

function RouteSwitch ( routes ) {
    // convert string paths in routes to regexps
    this.routes = routes.map(routeToMatcher);
    this.matcher = RU.makeRegExpSwitch(this.routes);
}


RouteSwitch.prototype.match = function match (path) {
    var m = this.matcher(path),
        i;
    if (m) {
        var params = {};
        // Copy over numeric indexes
        for (i = 0; i < m.match.length; i++) {
            params[i] = m.match[i];
        }
        // Named parameters
        if (m.matcher.keys && m.matcher.keys.length) {
            var keys = m.matcher.keys;
            // Map group to keys
            for (i = 0; i < keys.length; i++) {
                params[keys[i]] = m.match[i+1];
            }
        }
        return {
            route: m.matcher.route,
            params: params
        };
    } else {
        return null;
    }
};

RouteSwitch.prototype.addRoute = function addRoute(route) {
    var matcher = routeToMatcher(route);
    this.routes.push(matcher);
    this.matcher = RU.makeRegExpSwitch(this.routes);
};


RouteSwitch.prototype.removeRoute = function removeRoute(route) {
    this.routes = this.routes.filter(function(matcher) {
        return matcher.route !== route;
    });
    this.matcher = RU.makeRegExpSwitch(this.routes);
};


// Load all handlers from the handlers directory
function loadHandlers (path, log) {
    return readdir(path)
    .then(function(handlerNames) {
        var handlers = [];
        handlerNames.forEach(function(handlerName) {
            try {
                handlers.push(require(Path.resolve(path + '/' + handlerName)));
            } catch (e) {
                if (log) { log('error/handler', e, handlerName, e.stack); }
            }
        });
        return handlers;
    });
}

function makeRouter (path, log) {
}

/**
 * Create a new router from handlers in a directory.
 *
 * Each handler is expected to export a 'path' property. The router will map
 * to the full module.
 *
 * @static
 * @param {String} path to handle directory
 * @param {Function} [optional] log('level', message)
 * @returns {Promise<RouteSwitch>}
 */
RouteSwitch.prototype.fromHandlers = function fromHandlers(path, log) {
	// Load routes & handlers
    return loadHandlers(path, log)
    .then(function(handlers) {
        var allRoutes = [];
        handlers.forEach(function(handler) {
            handler.routes.forEach(function(route) {
                allRoutes.push({
                    pattern: route.path,
                    methods: route.methods
                });
            });
        });
        if (log) { log('notice', path, allRoutes); }
        return new RouteSwitch(allRoutes);
    });
};

module.exports = RouteSwitch;
