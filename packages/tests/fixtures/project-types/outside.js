'use strict';

/** @type {ProjectRows} */
var extras = [];

function list() {
	return extras.join(';');
}

module.exports = list;
