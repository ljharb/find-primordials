'use strict';

/** @type {ProjectRows} */
var rows = [];

function render() {
	return rows.join(',');
}

module.exports = render;
