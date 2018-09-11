/*
 * jsonizer
 * Copyright 2015
 * Authors: Leo Olmi.
 * All Rights Reserved.
 * Use, reproduction, distribution, and modification of this code is subject to the terms and
 * conditions of the MIT license, available at http://www.opensource.org/licenses/mit-license.php
 *
 * Project: https://github.com/leolmi/node-jsonizer
 */

const _ = require('lodash'),
  u = require('./lib/utils'),
  parser = require('./lib/parser'),
  https = require('https'),
  http = require('http'),
  querystring = require('querystring'),
  zlib = require("zlib");

const PREFIX_JS = 'JS=';
const PREFIX_RGX = 'RGX=';
const multipart_boundary_prefix = '---------------------------';
const multipart_body_header = 'Content-Disposition: form-data; name=';

'use strict';
const jsonizer = function() {
  function noop() {
  }

  const opt_prototype = {
    timeout: 150000,
    headers: {}
  };

  const _keepers = [
    {name: '__VIEWSTATE', pattern: '<input.*?name="__VIEWSTATE".*?value="(.*?)".*?>'},
    {name: '__VIEWSTATEGENERATOR', pattern: '<input.*?name="__VIEWSTATEGENERATOR".*?value="(.*?)".*?>'},
    {name: '__EVENTVALIDATION', pattern: '<input.*?name="__EVENTVALIDATION".*?value="(.*?)".*?>'}
  ];

  const ResultData = function () {};

  ResultData.prototype = {
    type: 'none',
    data: null,
    content: ''
  };

  function getData(sequence, data) {
    if (data && _.isArray(data) && data.length > 0) {
      let eo = {};
      data.forEach((item) => {
        if (_.isFunction(item.value.indexOf) && item.value.indexOf(PREFIX_JS) === 0) {
          const logic = item.value.substr(PREFIX_JS.length);
          eo[item.name] = evalJSLogic(logic, null, sequence.jsutil);
        } else {
          eo[item.name] = item.value;
        }
      });
      return querystring.stringify(eo);
    }
    return undefined;
  }

  function getMultipartData(opt, data) {
    let body = undefined;
    if (data && _.isArray(data) && data.length > 0) {
      const id = u.uuid();
      const boundary = multipart_boundary_prefix + id;
      body = '';
      data.forEach((item) => body += '--' + boundary + '\r\n' + multipart_body_header + '"' + item.name + '"\r\n\r\n' + item.value + '\r\n');
      body += '--' + boundary + '--';

      if (opt.headers['content-type'])
        opt.headers['content-type'] += ' boundary=' + boundary;
    }
    return body;
  }

  function getRedirectPath(opt, nxt) {
    const prev = opt.path.split('/');
    const next = nxt.split('/');
    if (opt.verbose) console.log('[REDIRECT]: prv=' + opt.path + '   prev=' + JSON.stringify(prev));
    if (opt.verbose) console.log('[REDIRECT]: nxt=' + nxt + '   next=' + JSON.stringify(next));

    if (prev.length) prev.pop();
    while (next.length && next[0] === '..') {
      next.splice(0, 1);
      prev.pop();
    }

    prev.push.apply(prev, next);

    nxt = prev.join('/');
    if (opt.verbose) console.log('[REDIRECT]: res=' + nxt + '   result=' + JSON.stringify(prev));
    return nxt;
  }

  function checkCookies(res, o) {
    if (_.has(res.headers, 'set-cookie'))
      o.headers.cookie = res.headers['set-cookie'];
  }

  /**
   * Richiesta
   * @param title
   * @param options
   * @param data
   * @param target
   * @param cb
   */
  function doRequest(title, options, data, target, cb) {
    let skipped = false;
    let download = false;
    cb = cb || noop;
    if (options.verbose) console.log('[' + title + ']-OPTIONS: ' + JSON.stringify(options, null, 2));
    options.agent = false;
    const proto = options.https ? https : http;
    const protocol = options.https ? 'https://' : 'http://';

    const req_opt = {
      path: protocol + options.host + options.path,
      method: options.method,
      headers: options.headers,
      host: options.host
    };

    if (options.proxy && process.env.PROXY_HOST) {
      req_opt.host = process.env.PROXY_HOST;
      req_opt.port = process.env.PROXY_PORT;
    }

    if (options.verbose) console.log('[' + title + ']-REQ OPT: ' + JSON.stringify(req_opt, null, 2));

    const req = proto.request(req_opt, (res) => {
      const result = {
        code: res.statusCode,
        headers: res.headers
      };
      if (options.verbose) console.log('[' + title + ']-RESULTS: ' + JSON.stringify(result, null, 2));
      checkCookies(res, options);

      const newpath = res.headers.location;
      if ((res.statusCode.toString() === '302' || res.statusCode.toString() === '301') && newpath) {
        skipped = true;
        if (options.verbose) console.log('new location:' + newpath);
        const path = getRedirectPath(options, newpath);
        if (path === options.path) {
          console.warn('Location is the same!');
          return;
        }
        if (!path || path.split(options.host).length > 2) {
          const msg = 'WARINNG: Wrong path: ' + path;
          console.error(msg);
          return;
        }
        options.path = path;
        if (options.verbose) console.log('Redir new path:' + options.path);
        checkCookies(res, options);

        doRequest('redir - ' + title, options, null, null, cb);
      }

      if (target) {
        download = true;
        res.setEncoding('binary');
        res.pipe(target);
        target.on('finish', () => {
          if (options.verbose) console.log('Write file ended!');
          target.close(cb(null, options, result));
        });
      }

      const chunks = [];
      let content = '';

      res.on('data', (chunk) => {
        const type = _.isString(chunk) ? 'stringa' : 'altro';
        if (options.verbose) console.log('[' + title + ']-download data (' + type + '): ' + chunk);
        content += chunk;
        chunks.push(chunk);
      });

      res.on('end', () => {
        if (options.verbose) console.log('[' + title + ']-Fine richiesta!   skipped=' + skipped + '   download=' + download + '  target=' + (target ? 'si' : 'no'));
        if (!skipped && !target && !download) {
          options.headers = _.merge(options.headers, req.headers);
          const buffer = Buffer.concat(chunks);

          const encoding = res.headers['content-encoding'];
          if (encoding === 'gzip') {
            zlib.gunzip(buffer, (err, decoded) => cb(err, options, result, decoded && decoded.toString()));
          } else if (encoding === 'deflate') {
            zlib.inflate(buffer, (err, decoded) => cb(err, options, result, decoded && decoded.toString()));
          } else {
            cb(null, options, result, buffer.toString());
          }
        }
      });
    });

    req.on('error', function (e) {
      if (options.verbose) console.log('[' + title + ']-problem with request: ' + JSON.stringify(e));
      cb(e);
    });

    if (data) {
      if (options.verbose) console.log('[' + title + ']-send data: ' + data);
      req.write(data);
    }

    if (options.timeout) {
      req.setTimeout(options.timeout, function () {
        cb('request timed out');
      });
    }

    req.end();
  }

  /**
   * Valida la classe delle opzioni
   * @param options
   */
  function check(options) {
    if (!_.has(options, 'headers'))
      options.headers = {};
  }

  function getUrl(options, item) {
    const protocol = options.https ? 'https://' : 'http://';
    return protocol + options.host + item.path;
  }

  function checkHost(url) {
    url = url.replace('http://', '');
    url = url.replace('https://', '');
    return url;
  }

  /**
   * Preleva i valori degli headers e del referer
   * @param options
   * @param item
   * @param sequence
   * @param index
   */
  function keep(options, item, sequence, index) {
    item.headers.forEach((h) => options.headers[h.name.toLowerCase()] = h.value);
    u.keep(options, item, ['method', 'path'], true);
    if (item.host) options.host = checkHost(item.host);

    //item precedente
    const preitem = (index > 0) ? sequence.items[index - 1] : null;

    if (item.referer) {
      const ref = item.referer.toLowerCase();
      // se 'auto' recupera l'indirizzo dello step precedente
      if (ref === 'auto') {
        if (preitem)
          options.headers.referer = getUrl(options, preitem);
        // se inizia per '=' si aspetta un indice dello step di referer
      } else if (ref.indexOf('=') === 0) {
        const i = parseInt(ref.substr(1));
        if (i > -1 && i < sequence.items.length)
          options.headers.referer = getUrl(options, sequence.items[i]);
        // altrimenti è esplicito
      } else options.headers.referer = item.referer;
    }
  }

  /**
   * verifica gli headers
   * @param options
   * @param item
   * @param data
   */
  function validateHeaders(options, item, data) {
    if (data && data.length) {
      options.headers['content-length'] = data.length;
    } else {
      delete options.headers['content-length'];
    }

    if (!_.has(options.headers, 'host'))
      options.headers['host'] = options.host;
  }

  function getItem(sequence, options, index, cb) {
    if (sequence && sequence.items && sequence.items.length > index) {
      while (sequence.items.length > index && sequence.items[index].skip) {
        if (options.verbose) console.log('[' + sequence.items[index].title + ']- n°' + index + 1 + ' SKIPPED');
        index++;
      }
      if (sequence.items.length <= index)
        return cb(new Error('Wrong sequence!'));
      cb(null, sequence.items[index], index);
    } else {
      cb(new Error('No available items!'));
    }
  }

  function isLast(sequence, index) {
    while (index < sequence.items.length && sequence.items[index].skip) {
      index = index + 1;
    }
    return index + 1 >= sequence.items.length;
  }

  function replaceSingleData(obj, prp, rgx, value) {
    if (!obj) return;
    if (_.isArray(obj)) {
      const pn = prp || 'value';
      obj.forEach((item) => {
        if (item[pn] && _.isFunction(item[pn].replace))
          item[pn] = item[pn].replace(rgx, value);
      });
    } else {
      const driver = (prp) ? prp : _.keys(obj);
      driver.forEach((k) => {
        if (_.isFunction(obj[k].replace))
          obj[k] = obj[k].replace(rgx, value);
      });
    }
  }

  /**
   * Scrive i valori dei parametri nei replacers
   * @param sequence
   * @param options
   * @param data
   */
  function replaceData(sequence, options, data) {
    const seq_prop = ['host', 'path'];
    sequence.parameters.forEach((p) => {
      const rgx = new RegExp('\\[' + p.name + '\\]', 'gmi');
      //properties
      replaceSingleData(options, seq_prop, rgx, p.value);
      //data
      replaceSingleData(data, null, rgx, p.value);
      //headers
      replaceSingleData(options.headers, null, rgx, p.value);
    });
  }

  function isValid(r) {
    return r != null && r !== undefined;
  }

  function evalJSLogic(logic, arg, util) {
    if (util) logic = util + '\n\n' + logic;
    const f = new Function('data', '_', logic);
    return f(arg, _, util);
  }

  function evalRgxLogic(logic, arg) {
    const rgx = new RegExp(logic);
    return rgx.exec(arg);
  }

  function evalKeeperLogic(keeper, arg, util) {
    if (!keeper.logic)
      return arg;
    switch (keeper.logicType) {
      case 'regex':
        return evalRgxLogic(keeper.logic, arg);
      case 'javascript':
        return evalJSLogic(keeper.logic, arg, util);
      default:
        return arg;
    }
  }

  function getCookie(cookie, name) {
    if (cookie) {
      const cookies = cookie.split(';');
      let pos = 0;
      cookie = _.find(cookies, (c) => {
        pos = c.indexOf(name + '=');
        return pos > -1;
      });
      if (cookie)
        return cookie.substr(pos + 1);
    }
  }

  function evalHeadersLogic(sequence, options) {
    _.keys(options.headers).forEach((k) => {
      const value = options.headers[k] || '';
      if (_.isFunction(value.indexOf) && value.indexOf(PREFIX_JS) === 0) {
        const logic = value.substr(PREFIX_JS.length);
        options.headers[k] = evalJSLogic(logic, null, sequence.jsutil);
      }
    });
  }

  /**
   * Esegue il singolo estrattore
   * @param sequence
   * @param keeper
   * @param options
   * @param content
   */
  function evalKeeper(sequence, keeper, options, content) {
    const target = _.find(sequence.parameters, (p) => p.id === keeper.target);
    if (!target) return;
    let value = null;
    switch (keeper.sourceType) {
      case 'body':
        value = evalKeeperLogic(keeper, content, sequence.jsutil);
        break;
      case 'cookies':
        let cookie = options.headers['cookie'] || options.headers['Cookie'];
        if (cookie) {
          if (keeper.name) cookie = getCookie(cookie, name);
          value = evalKeeperLogic(keeper, cookie, sequence.jsutil);
        }
        break;
      case 'headers':
        if (keeper.name) {
          let header = options.headers[name];
          if (header) value = evalKeeperLogic(keeper, options.headers[k], sequence.jsutil);
        } else {
          value = _.find(_.keys(options.headers), (k) => isValid(evalKeeperLogic(keeper, options.headers[k], sequence.jsutil)));
        }
        break;
    }
    if (value)
      target.value = value;
  }

  /**
   * Esegue gli estrattori a livello di item
   * @param sequence
   * @param item
   * @param options
   * @param content
   */
  function evalKeepers(sequence, item, options, content) {
    if (item.keepers.length) {
      item.keepers.forEach(function (k) {
        evalKeeper(sequence, k, options, content);
      });
    }
  }

  /**
   * Effettua una catena di chiamate sequenziali
   * @param sequence
   * @param {function} cb  //cb(err, content)
   * @param {object} [parseroptions]
   * @param {object} [options]
   * @param {number} [i]
   */
  function evalSequence(sequence, cb, parseroptions, options, i) {
    options = options || {};
    options = _.merge(options, opt_prototype);
    i = i || 0;

    if (options.verbose) console.log('OPTIONS: ' + JSON.stringify(options));
    getItem(sequence, options, i, function (err, item, index) {
      if (err) return cb(err);

      options.https = sequence.SSL;
      options.proxy = sequence.proxy;
      if (options.verbose) console.log('[' + item.title + ']-OPTIONS: (before check): ' + JSON.stringify(options));
      check(options);
      if (options.verbose) console.log('[' + item.title + ']-OPTIONS: (after check & before keep)' + JSON.stringify(options));
      keep(options, item, sequence, index);
      if (options.verbose) console.log('[' + item.title + ']-OPTIONS: (after keep)' + JSON.stringify(options));

      if (options.verbose) console.log('[' + item.title + ']-PRE DATA OBJECT: ' + JSON.stringify(item.data));
      replaceData(sequence, options, item.data);
      let data = undefined;
      switch (item.datatype) {
        case 'multipart':
          data = getMultipartData(options, item.data);
          break;
        default:
          data = getData(sequence, item.data);
          break;
      }
      validateHeaders(options, item, data);
      evalHeadersLogic(sequence, options);

      if (options.verbose) console.log('[' + item.title + ']-REQUEST BODY: ' + data);
      doRequest(item.title, options, data, undefined, (err, o, r, c) => {
        if (err) return cb(err);

        if (options.verbose) console.log('[' + item.title + '] - RICHIESTA EFFETTUATA SENZA ERRORI step=' + index);

        if (isLast(sequence, index)) {
          if (options.verbose) console.log('[' + item.title + '] - LAST ITEM (' + index + ') START PARSER...');
          parser.parse(c, parseroptions, (err, data) => {
            if (err) return cb(err);
            if (options.verbose) console.log('[' + item.title + '] - PARSER RESULT (' + index + ') START PARSER...');
            const result = new ResultData();
            result.type = parseroptions.type;
            result.data = data;
            result.content = c;
            return cb(err, result);
          });
        } else {
          if (options.verbose) console.log('[' + item.title + '] - NEXT ITEM (' + index + ' -> ' + (index + 1) + '?)');
          evalKeepers(sequence, item, options, c);
          evalSequence(sequence, cb, parseroptions, options, index + 1);
        }
      });
    });
  }


  /**
   * Effettua una catena di chiamate sequenziali
   * @param sequence                  // sequenza chiamate
   * @param {Function} cb             // cb(err, content)
   * @param {Object} [parseroptions]  // opzioni per il parser html
   * @param {Object} [options]        // opzioni chiamata web
   */
  function evalSequenceStart(sequence, cb, parseroptions, options) {
    return evalSequence(sequence, cb, parseroptions, options, 0);
  }

  return {
    util: {
      ok: function (res, obj) {return res.json(200, obj);},
      created: function (res, obj) {return res.json(201, obj);},
      deleted: function (res) {return res.json(204);},
      notfound: function (res) {return res.send(404);},
      error: function (res, err) {return res.send(500, err);},
      getkeeper: function (name) {return _.find(_keepers, {'name': name});}
    },
    parser: {
      types: parser.types,
      parse: parser.parse,
      parseHtmlTable: parser.parseHtmlTable,
      parseJsonContent: parser.parseJsonContent,
      parseCustomContent: parser.parseCustomContent
    },
    eval: evalSequenceStart
  };
}.call(this);

exports = module.exports = jsonizer;
