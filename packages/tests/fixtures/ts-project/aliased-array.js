// An in-scope alias prints as its own name, not as an array - and does so even if it fails to resolve

/** @import { Collected } from './aliased-array' */

/** @type {Collected} */
var collected = [];

function collect(entry) {
	collected.push(entry);
}

module.exports = collect;
