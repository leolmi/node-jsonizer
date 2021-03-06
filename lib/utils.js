/**
 * Created by Leo on 01/02/2015.
 */
'use strict';

const _ = require('lodash');

/**
 * Modifica tutti i caratteri diversi dalle lettere e numeri in underscore
 * @param filename
 * @returns {*}
 */
function validateFileName(filename){
  return filename.replace(/[^0-9a-zA-Z]+/g, "_");
}
exports.validateFileName = validateFileName;


exports.uiid_templates = {
    guid: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
    id12: 'xxxxxxxxxxxx'
};

exports.uuid = (template) => {
  template = template || 'xxxxxxxxxxxx';
  let d = new Date().getTime();
  return template.replace(/[xy]/g, function (c) {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};

/**
 * Restituisce una stringa effettuando il merging allineato a destra
 * del valore passato con il template (default = '00')
 * @example <caption>template = '00'</caption>
 * // returns '03'
 * merge(3);
 * @param v
 * @param {string} [template]
 * @returns {string}
 */
exports.merge = (v, template) => {
  template = template || '00';
  v = '' + v;
  const diff = template.length - v.length;
  if (diff > 0) v = template.slice(0, diff) + v;
  return v;
};


function getCharEsa(cc, upper) {
  let h = cc.toString(16);
  if (upper) h = h.toUpperCase();
  if (h.length < 2) h = "0" + h;
  return h;
}

function isLitteral(cc) {
  return (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122);
}

function encodeToEsa(s, pswmode) {
  let res = '';
  for (let i = 0, n = s.length; i < n; i++) {
    if (pswmode) {
      if (isLitteral(s.charCodeAt(i)))
        res += s[i];
      else {
        res += '%' + getCharEsa(s.charCodeAt(i), true);
      }
    }
    else {
      res += getCharEsa(s.charCodeAt(i));
    }
  }
  return res;
}
exports.encodeToEsa = encodeToEsa;

function decodeFromEsa(s) {
  let res = '';
  for (let i = 0, n = s.length; i < n; i += 2) {
    res += String.fromCharCode("0x" + s.substring(i, i + 2));
  }
  return res;
}
exports.decodeFromEsa = decodeFromEsa;

/**
 * Copia i valori (e le proprietà) dell'oggetto source in target
 * @param {object} target
 * @param {object} source
 * @param {boolean} [create]
 */
function mergeObject(target, source, create) {
  if (!source || !target) return;
  for (let pn in source) {
    if (_.has(target, pn) || create)
      target[pn] = source[pn];
  }
}
exports.merge = mergeObject;

/**
 * Copia tutti i valori delle proprietà definite nell'array keys
 * in target; se create è true e la proprietà non esiste in target
 * viene generata.
 * @param {object} target
 * @param {object} source
 * @param {object} [keys]
 * @param {boolean} [create]
 */
exports.keep = (target, source, keys, create) => {
  keys = keys || _.keys(target);
  //console.log('keys:'+JSON.stringify(keys));

  keys.forEach((pn) => {
    if (source[pn] && (_.has(target, pn) || create)) {
      if (_.isObject(source[pn])) {
        if (!_.has(target, pn))
          target[pn] = {};
        mergeObject(target[pn], source[pn], true);
      } else {
        target[pn] = source[pn];
      }
    }
  });
};

/**
 * Verifica la correttezza della sintassi dell'url
 * @param args
 * @returns {string}
 */
exports.checkUrl = (...args) => {
  const url = [];
  args.forEach((part) => {
    part = (part||'').replace(/:\/\//, '⌂⌂');
    part.split(/\//).forEach((p) => {
      if (p === '..') {
        url.pop();
      } else if (p && p !== '.') {
        url.push(p.replace(/⌂⌂/, '://'));
      }
    });
  });
  return url.join('/');
};
