// PakkaBill: Meesho listing.
// Makes Meesho's bulk-upload Excel from catalogue photos and the seller's own category template.
// The app calls window.pbListingMount(el) when #/listing opens; nothing below runs until then.
// Includes JSZip 3.10.1 (MIT licence, https://stuk.github.io/jszip/) so it also works offline.
(function () {
  var app = null;

  // JSZip, kept out of the global scope so it can't clash with anything else on the page.
  function loadZip() {
    var had = Object.prototype.hasOwnProperty.call(window, 'JSZip'), prev = window.JSZip;
/*!

JSZip v3.10.1 - A JavaScript class for generating and reading zip files
<http://stuartk.com/jszip>

(c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.

JSZip uses the library pako released under the MIT license :
https://github.com/nodeca/pako/blob/main/LICENSE
*/

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this).JSZip=e()}}(function(){return function s(a,o,h){function u(r,e){if(!o[r]){if(!a[r]){var t="function"==typeof require&&require;if(!e&&t)return t(r,!0);if(l)return l(r,!0);var n=new Error("Cannot find module '"+r+"'");throw n.code="MODULE_NOT_FOUND",n}var i=o[r]={exports:{}};a[r][0].call(i.exports,function(e){var t=a[r][1][e];return u(t||e)},i,i.exports,s,a,o,h)}return o[r].exports}for(var l="function"==typeof require&&require,e=0;e<h.length;e++)u(h[e]);return u}({1:[function(e,t,r){"use strict";var d=e("./utils"),c=e("./support"),p="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";r.encode=function(e){for(var t,r,n,i,s,a,o,h=[],u=0,l=e.length,f=l,c="string"!==d.getTypeOf(e);u<e.length;)f=l-u,n=c?(t=e[u++],r=u<l?e[u++]:0,u<l?e[u++]:0):(t=e.charCodeAt(u++),r=u<l?e.charCodeAt(u++):0,u<l?e.charCodeAt(u++):0),i=t>>2,s=(3&t)<<4|r>>4,a=1<f?(15&r)<<2|n>>6:64,o=2<f?63&n:64,h.push(p.charAt(i)+p.charAt(s)+p.charAt(a)+p.charAt(o));return h.join("")},r.decode=function(e){var t,r,n,i,s,a,o=0,h=0,u="data:";if(e.substr(0,u.length)===u)throw new Error("Invalid base64 input, it looks like a data url.");var l,f=3*(e=e.replace(/[^A-Za-z0-9+/=]/g,"")).length/4;if(e.charAt(e.length-1)===p.charAt(64)&&f--,e.charAt(e.length-2)===p.charAt(64)&&f--,f%1!=0)throw new Error("Invalid base64 input, bad content length.");for(l=c.uint8array?new Uint8Array(0|f):new Array(0|f);o<e.length;)t=p.indexOf(e.charAt(o++))<<2|(i=p.indexOf(e.charAt(o++)))>>4,r=(15&i)<<4|(s=p.indexOf(e.charAt(o++)))>>2,n=(3&s)<<6|(a=p.indexOf(e.charAt(o++))),l[h++]=t,64!==s&&(l[h++]=r),64!==a&&(l[h++]=n);return l}},{"./support":30,"./utils":32}],2:[function(e,t,r){"use strict";var n=e("./external"),i=e("./stream/DataWorker"),s=e("./stream/Crc32Probe"),a=e("./stream/DataLengthProbe");function o(e,t,r,n,i){this.compressedSize=e,this.uncompressedSize=t,this.crc32=r,this.compression=n,this.compressedContent=i}o.prototype={getContentWorker:function(){var e=new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")),t=this;return e.on("end",function(){if(this.streamInfo.data_length!==t.uncompressedSize)throw new Error("Bug : uncompressed data size mismatch")}),e},getCompressedWorker:function(){return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize",this.compressedSize).withStreamInfo("uncompressedSize",this.uncompressedSize).withStreamInfo("crc32",this.crc32).withStreamInfo("compression",this.compression)}},o.createWorkerFrom=function(e,t,r){return e.pipe(new s).pipe(new a("uncompressedSize")).pipe(t.compressWorker(r)).pipe(new a("compressedSize")).withStreamInfo("compression",t)},t.exports=o},{"./external":6,"./stream/Crc32Probe":25,"./stream/DataLengthProbe":26,"./stream/DataWorker":27}],3:[function(e,t,r){"use strict";var n=e("./stream/GenericWorker");r.STORE={magic:"\0\0",compressWorker:function(){return new n("STORE compression")},uncompressWorker:function(){return new n("STORE decompression")}},r.DEFLATE=e("./flate")},{"./flate":7,"./stream/GenericWorker":28}],4:[function(e,t,r){"use strict";var n=e("./utils");var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t){return void 0!==e&&e.length?"string"!==n.getTypeOf(e)?function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}(0|t,e,e.length,0):function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t.charCodeAt(a))];return-1^e}(0|t,e,e.length,0):0}},{"./utils":32}],5:[function(e,t,r){"use strict";r.base64=!1,r.binary=!1,r.dir=!1,r.createFolders=!0,r.date=null,r.compression=null,r.compressionOptions=null,r.comment=null,r.unixPermissions=null,r.dosPermissions=null},{}],6:[function(e,t,r){"use strict";var n=null;n="undefined"!=typeof Promise?Promise:e("lie"),t.exports={Promise:n}},{lie:37}],7:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Uint32Array,i=e("pako"),s=e("./utils"),a=e("./stream/GenericWorker"),o=n?"uint8array":"array";function h(e,t){a.call(this,"FlateWorker/"+e),this._pako=null,this._pakoAction=e,this._pakoOptions=t,this.meta={}}r.magic="\b\0",s.inherits(h,a),h.prototype.processChunk=function(e){this.meta=e.meta,null===this._pako&&this._createPako(),this._pako.push(s.transformTo(o,e.data),!1)},h.prototype.flush=function(){a.prototype.flush.call(this),null===this._pako&&this._createPako(),this._pako.push([],!0)},h.prototype.cleanUp=function(){a.prototype.cleanUp.call(this),this._pako=null},h.prototype._createPako=function(){this._pako=new i[this._pakoAction]({raw:!0,level:this._pakoOptions.level||-1});var t=this;this._pako.onData=function(e){t.push({data:e,meta:t.meta})}},r.compressWorker=function(e){return new h("Deflate",e)},r.uncompressWorker=function(){return new h("Inflate",{})}},{"./stream/GenericWorker":28,"./utils":32,pako:38}],8:[function(e,t,r){"use strict";function A(e,t){var r,n="";for(r=0;r<t;r++)n+=String.fromCharCode(255&e),e>>>=8;return n}function n(e,t,r,n,i,s){var a,o,h=e.file,u=e.compression,l=s!==O.utf8encode,f=I.transformTo("string",s(h.name)),c=I.transformTo("string",O.utf8encode(h.name)),d=h.comment,p=I.transformTo("string",s(d)),m=I.transformTo("string",O.utf8encode(d)),_=c.length!==h.name.length,g=m.length!==d.length,b="",v="",y="",w=h.dir,k=h.date,x={crc32:0,compressedSize:0,uncompressedSize:0};t&&!r||(x.crc32=e.crc32,x.compressedSize=e.compressedSize,x.uncompressedSize=e.uncompressedSize);var S=0;t&&(S|=8),l||!_&&!g||(S|=2048);var z=0,C=0;w&&(z|=16),"UNIX"===i?(C=798,z|=function(e,t){var r=e;return e||(r=t?16893:33204),(65535&r)<<16}(h.unixPermissions,w)):(C=20,z|=function(e){return 63&(e||0)}(h.dosPermissions)),a=k.getUTCHours(),a<<=6,a|=k.getUTCMinutes(),a<<=5,a|=k.getUTCSeconds()/2,o=k.getUTCFullYear()-1980,o<<=4,o|=k.getUTCMonth()+1,o<<=5,o|=k.getUTCDate(),_&&(v=A(1,1)+A(B(f),4)+c,b+="up"+A(v.length,2)+v),g&&(y=A(1,1)+A(B(p),4)+m,b+="uc"+A(y.length,2)+y);var E="";return E+="\n\0",E+=A(S,2),E+=u.magic,E+=A(a,2),E+=A(o,2),E+=A(x.crc32,4),E+=A(x.compressedSize,4),E+=A(x.uncompressedSize,4),E+=A(f.length,2),E+=A(b.length,2),{fileRecord:R.LOCAL_FILE_HEADER+E+f+b,dirRecord:R.CENTRAL_FILE_HEADER+A(C,2)+E+A(p.length,2)+"\0\0\0\0"+A(z,4)+A(n,4)+f+b+p}}var I=e("../utils"),i=e("../stream/GenericWorker"),O=e("../utf8"),B=e("../crc32"),R=e("../signature");function s(e,t,r,n){i.call(this,"ZipFileWorker"),this.bytesWritten=0,this.zipComment=t,this.zipPlatform=r,this.encodeFileName=n,this.streamFiles=e,this.accumulate=!1,this.contentBuffer=[],this.dirRecords=[],this.currentSourceOffset=0,this.entriesCount=0,this.currentFile=null,this._sources=[]}I.inherits(s,i),s.prototype.push=function(e){var t=e.meta.percent||0,r=this.entriesCount,n=this._sources.length;this.accumulate?this.contentBuffer.push(e):(this.bytesWritten+=e.data.length,i.prototype.push.call(this,{data:e.data,meta:{currentFile:this.currentFile,percent:r?(t+100*(r-n-1))/r:100}}))},s.prototype.openedSource=function(e){this.currentSourceOffset=this.bytesWritten,this.currentFile=e.file.name;var t=this.streamFiles&&!e.file.dir;if(t){var r=n(e,t,!1,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);this.push({data:r.fileRecord,meta:{percent:0}})}else this.accumulate=!0},s.prototype.closedSource=function(e){this.accumulate=!1;var t=this.streamFiles&&!e.file.dir,r=n(e,t,!0,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);if(this.dirRecords.push(r.dirRecord),t)this.push({data:function(e){return R.DATA_DESCRIPTOR+A(e.crc32,4)+A(e.compressedSize,4)+A(e.uncompressedSize,4)}(e),meta:{percent:100}});else for(this.push({data:r.fileRecord,meta:{percent:0}});this.contentBuffer.length;)this.push(this.contentBuffer.shift());this.currentFile=null},s.prototype.flush=function(){for(var e=this.bytesWritten,t=0;t<this.dirRecords.length;t++)this.push({data:this.dirRecords[t],meta:{percent:100}});var r=this.bytesWritten-e,n=function(e,t,r,n,i){var s=I.transformTo("string",i(n));return R.CENTRAL_DIRECTORY_END+"\0\0\0\0"+A(e,2)+A(e,2)+A(t,4)+A(r,4)+A(s.length,2)+s}(this.dirRecords.length,r,e,this.zipComment,this.encodeFileName);this.push({data:n,meta:{percent:100}})},s.prototype.prepareNextSource=function(){this.previous=this._sources.shift(),this.openedSource(this.previous.streamInfo),this.isPaused?this.previous.pause():this.previous.resume()},s.prototype.registerPrevious=function(e){this._sources.push(e);var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.closedSource(t.previous.streamInfo),t._sources.length?t.prepareNextSource():t.end()}),e.on("error",function(e){t.error(e)}),this},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this.previous&&this._sources.length?(this.prepareNextSource(),!0):this.previous||this._sources.length||this.generatedError?void 0:(this.end(),!0))},s.prototype.error=function(e){var t=this._sources;if(!i.prototype.error.call(this,e))return!1;for(var r=0;r<t.length;r++)try{t[r].error(e)}catch(e){}return!0},s.prototype.lock=function(){i.prototype.lock.call(this);for(var e=this._sources,t=0;t<e.length;t++)e[t].lock()},t.exports=s},{"../crc32":4,"../signature":23,"../stream/GenericWorker":28,"../utf8":31,"../utils":32}],9:[function(e,t,r){"use strict";var u=e("../compressions"),n=e("./ZipFileWorker");r.generateWorker=function(e,a,t){var o=new n(a.streamFiles,t,a.platform,a.encodeFileName),h=0;try{e.forEach(function(e,t){h++;var r=function(e,t){var r=e||t,n=u[r];if(!n)throw new Error(r+" is not a valid compression method !");return n}(t.options.compression,a.compression),n=t.options.compressionOptions||a.compressionOptions||{},i=t.dir,s=t.date;t._compressWorker(r,n).withStreamInfo("file",{name:e,dir:i,date:s,comment:t.comment||"",unixPermissions:t.unixPermissions,dosPermissions:t.dosPermissions}).pipe(o)}),o.entriesCount=h}catch(e){o.error(e)}return o}},{"../compressions":3,"./ZipFileWorker":8}],10:[function(e,t,r){"use strict";function n(){if(!(this instanceof n))return new n;if(arguments.length)throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");this.files=Object.create(null),this.comment=null,this.root="",this.clone=function(){var e=new n;for(var t in this)"function"!=typeof this[t]&&(e[t]=this[t]);return e}}(n.prototype=e("./object")).loadAsync=e("./load"),n.support=e("./support"),n.defaults=e("./defaults"),n.version="3.10.1",n.loadAsync=function(e,t){return(new n).loadAsync(e,t)},n.external=e("./external"),t.exports=n},{"./defaults":5,"./external":6,"./load":11,"./object":15,"./support":30}],11:[function(e,t,r){"use strict";var u=e("./utils"),i=e("./external"),n=e("./utf8"),s=e("./zipEntries"),a=e("./stream/Crc32Probe"),l=e("./nodejsUtils");function f(n){return new i.Promise(function(e,t){var r=n.decompressed.getContentWorker().pipe(new a);r.on("error",function(e){t(e)}).on("end",function(){r.streamInfo.crc32!==n.decompressed.crc32?t(new Error("Corrupted zip : CRC32 mismatch")):e()}).resume()})}t.exports=function(e,o){var h=this;return o=u.extend(o||{},{base64:!1,checkCRC32:!1,optimizedBinaryString:!1,createFolders:!1,decodeFileName:n.utf8decode}),l.isNode&&l.isStream(e)?i.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")):u.prepareContent("the loaded zip file",e,!0,o.optimizedBinaryString,o.base64).then(function(e){var t=new s(o);return t.load(e),t}).then(function(e){var t=[i.Promise.resolve(e)],r=e.files;if(o.checkCRC32)for(var n=0;n<r.length;n++)t.push(f(r[n]));return i.Promise.all(t)}).then(function(e){for(var t=e.shift(),r=t.files,n=0;n<r.length;n++){var i=r[n],s=i.fileNameStr,a=u.resolve(i.fileNameStr);h.file(a,i.decompressed,{binary:!0,optimizedBinaryString:!0,date:i.date,dir:i.dir,comment:i.fileCommentStr.length?i.fileCommentStr:null,unixPermissions:i.unixPermissions,dosPermissions:i.dosPermissions,createFolders:o.createFolders}),i.dir||(h.file(a).unsafeOriginalName=s)}return t.zipComment.length&&(h.comment=t.zipComment),h})}},{"./external":6,"./nodejsUtils":14,"./stream/Crc32Probe":25,"./utf8":31,"./utils":32,"./zipEntries":33}],12:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../stream/GenericWorker");function s(e,t){i.call(this,"Nodejs stream input adapter for "+e),this._upstreamEnded=!1,this._bindStream(t)}n.inherits(s,i),s.prototype._bindStream=function(e){var t=this;(this._stream=e).pause(),e.on("data",function(e){t.push({data:e,meta:{percent:0}})}).on("error",function(e){t.isPaused?this.generatedError=e:t.error(e)}).on("end",function(){t.isPaused?t._upstreamEnded=!0:t.end()})},s.prototype.pause=function(){return!!i.prototype.pause.call(this)&&(this._stream.pause(),!0)},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(this._upstreamEnded?this.end():this._stream.resume(),!0)},t.exports=s},{"../stream/GenericWorker":28,"../utils":32}],13:[function(e,t,r){"use strict";var i=e("readable-stream").Readable;function n(e,t,r){i.call(this,t),this._helper=e;var n=this;e.on("data",function(e,t){n.push(e)||n._helper.pause(),r&&r(t)}).on("error",function(e){n.emit("error",e)}).on("end",function(){n.push(null)})}e("../utils").inherits(n,i),n.prototype._read=function(){this._helper.resume()},t.exports=n},{"../utils":32,"readable-stream":16}],14:[function(e,t,r){"use strict";t.exports={isNode:"undefined"!=typeof Buffer,newBufferFrom:function(e,t){if(Buffer.from&&Buffer.from!==Uint8Array.from)return Buffer.from(e,t);if("number"==typeof e)throw new Error('The "data" argument must not be a number');return new Buffer(e,t)},allocBuffer:function(e){if(Buffer.alloc)return Buffer.alloc(e);var t=new Buffer(e);return t.fill(0),t},isBuffer:function(e){return Buffer.isBuffer(e)},isStream:function(e){return e&&"function"==typeof e.on&&"function"==typeof e.pause&&"function"==typeof e.resume}}},{}],15:[function(e,t,r){"use strict";function s(e,t,r){var n,i=u.getTypeOf(t),s=u.extend(r||{},f);s.date=s.date||new Date,null!==s.compression&&(s.compression=s.compression.toUpperCase()),"string"==typeof s.unixPermissions&&(s.unixPermissions=parseInt(s.unixPermissions,8)),s.unixPermissions&&16384&s.unixPermissions&&(s.dir=!0),s.dosPermissions&&16&s.dosPermissions&&(s.dir=!0),s.dir&&(e=g(e)),s.createFolders&&(n=_(e))&&b.call(this,n,!0);var a="string"===i&&!1===s.binary&&!1===s.base64;r&&void 0!==r.binary||(s.binary=!a),(t instanceof c&&0===t.uncompressedSize||s.dir||!t||0===t.length)&&(s.base64=!1,s.binary=!0,t="",s.compression="STORE",i="string");var o=null;o=t instanceof c||t instanceof l?t:p.isNode&&p.isStream(t)?new m(e,t):u.prepareContent(e,t,s.binary,s.optimizedBinaryString,s.base64);var h=new d(e,o,s);this.files[e]=h}var i=e("./utf8"),u=e("./utils"),l=e("./stream/GenericWorker"),a=e("./stream/StreamHelper"),f=e("./defaults"),c=e("./compressedObject"),d=e("./zipObject"),o=e("./generate"),p=e("./nodejsUtils"),m=e("./nodejs/NodejsStreamInputAdapter"),_=function(e){"/"===e.slice(-1)&&(e=e.substring(0,e.length-1));var t=e.lastIndexOf("/");return 0<t?e.substring(0,t):""},g=function(e){return"/"!==e.slice(-1)&&(e+="/"),e},b=function(e,t){return t=void 0!==t?t:f.createFolders,e=g(e),this.files[e]||s.call(this,e,null,{dir:!0,createFolders:t}),this.files[e]};function h(e){return"[object RegExp]"===Object.prototype.toString.call(e)}var n={load:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},forEach:function(e){var t,r,n;for(t in this.files)n=this.files[t],(r=t.slice(this.root.length,t.length))&&t.slice(0,this.root.length)===this.root&&e(r,n)},filter:function(r){var n=[];return this.forEach(function(e,t){r(e,t)&&n.push(t)}),n},file:function(e,t,r){if(1!==arguments.length)return e=this.root+e,s.call(this,e,t,r),this;if(h(e)){var n=e;return this.filter(function(e,t){return!t.dir&&n.test(e)})}var i=this.files[this.root+e];return i&&!i.dir?i:null},folder:function(r){if(!r)return this;if(h(r))return this.filter(function(e,t){return t.dir&&r.test(e)});var e=this.root+r,t=b.call(this,e),n=this.clone();return n.root=t.name,n},remove:function(r){r=this.root+r;var e=this.files[r];if(e||("/"!==r.slice(-1)&&(r+="/"),e=this.files[r]),e&&!e.dir)delete this.files[r];else for(var t=this.filter(function(e,t){return t.name.slice(0,r.length)===r}),n=0;n<t.length;n++)delete this.files[t[n].name];return this},generate:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},generateInternalStream:function(e){var t,r={};try{if((r=u.extend(e||{},{streamFiles:!1,compression:"STORE",compressionOptions:null,type:"",platform:"DOS",comment:null,mimeType:"application/zip",encodeFileName:i.utf8encode})).type=r.type.toLowerCase(),r.compression=r.compression.toUpperCase(),"binarystring"===r.type&&(r.type="string"),!r.type)throw new Error("No output type specified.");u.checkSupport(r.type),"darwin"!==r.platform&&"freebsd"!==r.platform&&"linux"!==r.platform&&"sunos"!==r.platform||(r.platform="UNIX"),"win32"===r.platform&&(r.platform="DOS");var n=r.comment||this.comment||"";t=o.generateWorker(this,r,n)}catch(e){(t=new l("error")).error(e)}return new a(t,r.type||"string",r.mimeType)},generateAsync:function(e,t){return this.generateInternalStream(e).accumulate(t)},generateNodeStream:function(e,t){return(e=e||{}).type||(e.type="nodebuffer"),this.generateInternalStream(e).toNodejsStream(t)}};t.exports=n},{"./compressedObject":2,"./defaults":5,"./generate":9,"./nodejs/NodejsStreamInputAdapter":12,"./nodejsUtils":14,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31,"./utils":32,"./zipObject":35}],16:[function(e,t,r){"use strict";t.exports=e("stream")},{stream:void 0}],17:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e);for(var t=0;t<this.data.length;t++)e[t]=255&e[t]}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data[this.zero+e]},i.prototype.lastIndexOfSignature=function(e){for(var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.length-4;0<=s;--s)if(this.data[s]===t&&this.data[s+1]===r&&this.data[s+2]===n&&this.data[s+3]===i)return s-this.zero;return-1},i.prototype.readAndCheckSignature=function(e){var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.readData(4);return t===s[0]&&r===s[1]&&n===s[2]&&i===s[3]},i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return[];var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],18:[function(e,t,r){"use strict";var n=e("../utils");function i(e){this.data=e,this.length=e.length,this.index=0,this.zero=0}i.prototype={checkOffset:function(e){this.checkIndex(this.index+e)},checkIndex:function(e){if(this.length<this.zero+e||e<0)throw new Error("End of data reached (data length = "+this.length+", asked index = "+e+"). Corrupted zip ?")},setIndex:function(e){this.checkIndex(e),this.index=e},skip:function(e){this.setIndex(this.index+e)},byteAt:function(){},readInt:function(e){var t,r=0;for(this.checkOffset(e),t=this.index+e-1;t>=this.index;t--)r=(r<<8)+this.byteAt(t);return this.index+=e,r},readString:function(e){return n.transformTo("string",this.readData(e))},readData:function(){},lastIndexOfSignature:function(){},readAndCheckSignature:function(){},readDate:function(){var e=this.readInt(4);return new Date(Date.UTC(1980+(e>>25&127),(e>>21&15)-1,e>>16&31,e>>11&31,e>>5&63,(31&e)<<1))}},t.exports=i},{"../utils":32}],19:[function(e,t,r){"use strict";var n=e("./Uint8ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./Uint8ArrayReader":21}],20:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data.charCodeAt(this.zero+e)},i.prototype.lastIndexOfSignature=function(e){return this.data.lastIndexOf(e)-this.zero},i.prototype.readAndCheckSignature=function(e){return e===this.readData(4)},i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],21:[function(e,t,r){"use strict";var n=e("./ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return new Uint8Array(0);var t=this.data.subarray(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./ArrayReader":17}],22:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../support"),s=e("./ArrayReader"),a=e("./StringReader"),o=e("./NodeBufferReader"),h=e("./Uint8ArrayReader");t.exports=function(e){var t=n.getTypeOf(e);return n.checkSupport(t),"string"!==t||i.uint8array?"nodebuffer"===t?new o(e):i.uint8array?new h(n.transformTo("uint8array",e)):new s(n.transformTo("array",e)):new a(e)}},{"../support":30,"../utils":32,"./ArrayReader":17,"./NodeBufferReader":19,"./StringReader":20,"./Uint8ArrayReader":21}],23:[function(e,t,r){"use strict";r.LOCAL_FILE_HEADER="PK",r.CENTRAL_FILE_HEADER="PK",r.CENTRAL_DIRECTORY_END="PK",r.ZIP64_CENTRAL_DIRECTORY_LOCATOR="PK",r.ZIP64_CENTRAL_DIRECTORY_END="PK",r.DATA_DESCRIPTOR="PK\b"},{}],24:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../utils");function s(e){n.call(this,"ConvertWorker to "+e),this.destType=e}i.inherits(s,n),s.prototype.processChunk=function(e){this.push({data:i.transformTo(this.destType,e.data),meta:e.meta})},t.exports=s},{"../utils":32,"./GenericWorker":28}],25:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../crc32");function s(){n.call(this,"Crc32Probe"),this.withStreamInfo("crc32",0)}e("../utils").inherits(s,n),s.prototype.processChunk=function(e){this.streamInfo.crc32=i(e.data,this.streamInfo.crc32||0),this.push(e)},t.exports=s},{"../crc32":4,"../utils":32,"./GenericWorker":28}],26:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataLengthProbe for "+e),this.propName=e,this.withStreamInfo(e,0)}n.inherits(s,i),s.prototype.processChunk=function(e){if(e){var t=this.streamInfo[this.propName]||0;this.streamInfo[this.propName]=t+e.data.length}i.prototype.processChunk.call(this,e)},t.exports=s},{"../utils":32,"./GenericWorker":28}],27:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataWorker");var t=this;this.dataIsReady=!1,this.index=0,this.max=0,this.data=null,this.type="",this._tickScheduled=!1,e.then(function(e){t.dataIsReady=!0,t.data=e,t.max=e&&e.length||0,t.type=n.getTypeOf(e),t.isPaused||t._tickAndRepeat()},function(e){t.error(e)})}n.inherits(s,i),s.prototype.cleanUp=function(){i.prototype.cleanUp.call(this),this.data=null},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this._tickScheduled&&this.dataIsReady&&(this._tickScheduled=!0,n.delay(this._tickAndRepeat,[],this)),!0)},s.prototype._tickAndRepeat=function(){this._tickScheduled=!1,this.isPaused||this.isFinished||(this._tick(),this.isFinished||(n.delay(this._tickAndRepeat,[],this),this._tickScheduled=!0))},s.prototype._tick=function(){if(this.isPaused||this.isFinished)return!1;var e=null,t=Math.min(this.max,this.index+16384);if(this.index>=this.max)return this.end();switch(this.type){case"string":e=this.data.substring(this.index,t);break;case"uint8array":e=this.data.subarray(this.index,t);break;case"array":case"nodebuffer":e=this.data.slice(this.index,t)}return this.index=t,this.push({data:e,meta:{percent:this.max?this.index/this.max*100:0}})},t.exports=s},{"../utils":32,"./GenericWorker":28}],28:[function(e,t,r){"use strict";function n(e){this.name=e||"default",this.streamInfo={},this.generatedError=null,this.extraStreamInfo={},this.isPaused=!0,this.isFinished=!1,this.isLocked=!1,this._listeners={data:[],end:[],error:[]},this.previous=null}n.prototype={push:function(e){this.emit("data",e)},end:function(){if(this.isFinished)return!1;this.flush();try{this.emit("end"),this.cleanUp(),this.isFinished=!0}catch(e){this.emit("error",e)}return!0},error:function(e){return!this.isFinished&&(this.isPaused?this.generatedError=e:(this.isFinished=!0,this.emit("error",e),this.previous&&this.previous.error(e),this.cleanUp()),!0)},on:function(e,t){return this._listeners[e].push(t),this},cleanUp:function(){this.streamInfo=this.generatedError=this.extraStreamInfo=null,this._listeners=[]},emit:function(e,t){if(this._listeners[e])for(var r=0;r<this._listeners[e].length;r++)this._listeners[e][r].call(this,t)},pipe:function(e){return e.registerPrevious(this)},registerPrevious:function(e){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.streamInfo=e.streamInfo,this.mergeStreamInfo(),this.previous=e;var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.end()}),e.on("error",function(e){t.error(e)}),this},pause:function(){return!this.isPaused&&!this.isFinished&&(this.isPaused=!0,this.previous&&this.previous.pause(),!0)},resume:function(){if(!this.isPaused||this.isFinished)return!1;var e=this.isPaused=!1;return this.generatedError&&(this.error(this.generatedError),e=!0),this.previous&&this.previous.resume(),!e},flush:function(){},processChunk:function(e){this.push(e)},withStreamInfo:function(e,t){return this.extraStreamInfo[e]=t,this.mergeStreamInfo(),this},mergeStreamInfo:function(){for(var e in this.extraStreamInfo)Object.prototype.hasOwnProperty.call(this.extraStreamInfo,e)&&(this.streamInfo[e]=this.extraStreamInfo[e])},lock:function(){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.isLocked=!0,this.previous&&this.previous.lock()},toString:function(){var e="Worker "+this.name;return this.previous?this.previous+" -> "+e:e}},t.exports=n},{}],29:[function(e,t,r){"use strict";var h=e("../utils"),i=e("./ConvertWorker"),s=e("./GenericWorker"),u=e("../base64"),n=e("../support"),a=e("../external"),o=null;if(n.nodestream)try{o=e("../nodejs/NodejsStreamOutputAdapter")}catch(e){}function l(e,o){return new a.Promise(function(t,r){var n=[],i=e._internalType,s=e._outputType,a=e._mimeType;e.on("data",function(e,t){n.push(e),o&&o(t)}).on("error",function(e){n=[],r(e)}).on("end",function(){try{var e=function(e,t,r){switch(e){case"blob":return h.newBlob(h.transformTo("arraybuffer",t),r);case"base64":return u.encode(t);default:return h.transformTo(e,t)}}(s,function(e,t){var r,n=0,i=null,s=0;for(r=0;r<t.length;r++)s+=t[r].length;switch(e){case"string":return t.join("");case"array":return Array.prototype.concat.apply([],t);case"uint8array":for(i=new Uint8Array(s),r=0;r<t.length;r++)i.set(t[r],n),n+=t[r].length;return i;case"nodebuffer":return Buffer.concat(t);default:throw new Error("concat : unsupported type '"+e+"'")}}(i,n),a);t(e)}catch(e){r(e)}n=[]}).resume()})}function f(e,t,r){var n=t;switch(t){case"blob":case"arraybuffer":n="uint8array";break;case"base64":n="string"}try{this._internalType=n,this._outputType=t,this._mimeType=r,h.checkSupport(n),this._worker=e.pipe(new i(n)),e.lock()}catch(e){this._worker=new s("error"),this._worker.error(e)}}f.prototype={accumulate:function(e){return l(this,e)},on:function(e,t){var r=this;return"data"===e?this._worker.on(e,function(e){t.call(r,e.data,e.meta)}):this._worker.on(e,function(){h.delay(t,arguments,r)}),this},resume:function(){return h.delay(this._worker.resume,[],this._worker),this},pause:function(){return this._worker.pause(),this},toNodejsStream:function(e){if(h.checkSupport("nodestream"),"nodebuffer"!==this._outputType)throw new Error(this._outputType+" is not supported by this method");return new o(this,{objectMode:"nodebuffer"!==this._outputType},e)}},t.exports=f},{"../base64":1,"../external":6,"../nodejs/NodejsStreamOutputAdapter":13,"../support":30,"../utils":32,"./ConvertWorker":24,"./GenericWorker":28}],30:[function(e,t,r){"use strict";if(r.base64=!0,r.array=!0,r.string=!0,r.arraybuffer="undefined"!=typeof ArrayBuffer&&"undefined"!=typeof Uint8Array,r.nodebuffer="undefined"!=typeof Buffer,r.uint8array="undefined"!=typeof Uint8Array,"undefined"==typeof ArrayBuffer)r.blob=!1;else{var n=new ArrayBuffer(0);try{r.blob=0===new Blob([n],{type:"application/zip"}).size}catch(e){try{var i=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);i.append(n),r.blob=0===i.getBlob("application/zip").size}catch(e){r.blob=!1}}}try{r.nodestream=!!e("readable-stream").Readable}catch(e){r.nodestream=!1}},{"readable-stream":16}],31:[function(e,t,s){"use strict";for(var o=e("./utils"),h=e("./support"),r=e("./nodejsUtils"),n=e("./stream/GenericWorker"),u=new Array(256),i=0;i<256;i++)u[i]=252<=i?6:248<=i?5:240<=i?4:224<=i?3:192<=i?2:1;u[254]=u[254]=1;function a(){n.call(this,"utf-8 decode"),this.leftOver=null}function l(){n.call(this,"utf-8 encode")}s.utf8encode=function(e){return h.nodebuffer?r.newBufferFrom(e,"utf-8"):function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=h.uint8array?new Uint8Array(o):new Array(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t}(e)},s.utf8decode=function(e){return h.nodebuffer?o.transformTo("nodebuffer",e).toString("utf-8"):function(e){var t,r,n,i,s=e.length,a=new Array(2*s);for(t=r=0;t<s;)if((n=e[t++])<128)a[r++]=n;else if(4<(i=u[n]))a[r++]=65533,t+=i-1;else{for(n&=2===i?31:3===i?15:7;1<i&&t<s;)n=n<<6|63&e[t++],i--;1<i?a[r++]=65533:n<65536?a[r++]=n:(n-=65536,a[r++]=55296|n>>10&1023,a[r++]=56320|1023&n)}return a.length!==r&&(a.subarray?a=a.subarray(0,r):a.length=r),o.applyFromCharCode(a)}(e=o.transformTo(h.uint8array?"uint8array":"array",e))},o.inherits(a,n),a.prototype.processChunk=function(e){var t=o.transformTo(h.uint8array?"uint8array":"array",e.data);if(this.leftOver&&this.leftOver.length){if(h.uint8array){var r=t;(t=new Uint8Array(r.length+this.leftOver.length)).set(this.leftOver,0),t.set(r,this.leftOver.length)}else t=this.leftOver.concat(t);this.leftOver=null}var n=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}(t),i=t;n!==t.length&&(h.uint8array?(i=t.subarray(0,n),this.leftOver=t.subarray(n,t.length)):(i=t.slice(0,n),this.leftOver=t.slice(n,t.length))),this.push({data:s.utf8decode(i),meta:e.meta})},a.prototype.flush=function(){this.leftOver&&this.leftOver.length&&(this.push({data:s.utf8decode(this.leftOver),meta:{}}),this.leftOver=null)},s.Utf8DecodeWorker=a,o.inherits(l,n),l.prototype.processChunk=function(e){this.push({data:s.utf8encode(e.data),meta:e.meta})},s.Utf8EncodeWorker=l},{"./nodejsUtils":14,"./stream/GenericWorker":28,"./support":30,"./utils":32}],32:[function(e,t,a){"use strict";var o=e("./support"),h=e("./base64"),r=e("./nodejsUtils"),u=e("./external");function n(e){return e}function l(e,t){for(var r=0;r<e.length;++r)t[r]=255&e.charCodeAt(r);return t}e("setimmediate"),a.newBlob=function(t,r){a.checkSupport("blob");try{return new Blob([t],{type:r})}catch(e){try{var n=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);return n.append(t),n.getBlob(r)}catch(e){throw new Error("Bug : can't construct the Blob.")}}};var i={stringifyByChunk:function(e,t,r){var n=[],i=0,s=e.length;if(s<=r)return String.fromCharCode.apply(null,e);for(;i<s;)"array"===t||"nodebuffer"===t?n.push(String.fromCharCode.apply(null,e.slice(i,Math.min(i+r,s)))):n.push(String.fromCharCode.apply(null,e.subarray(i,Math.min(i+r,s)))),i+=r;return n.join("")},stringifyByChar:function(e){for(var t="",r=0;r<e.length;r++)t+=String.fromCharCode(e[r]);return t},applyCanBeUsed:{uint8array:function(){try{return o.uint8array&&1===String.fromCharCode.apply(null,new Uint8Array(1)).length}catch(e){return!1}}(),nodebuffer:function(){try{return o.nodebuffer&&1===String.fromCharCode.apply(null,r.allocBuffer(1)).length}catch(e){return!1}}()}};function s(e){var t=65536,r=a.getTypeOf(e),n=!0;if("uint8array"===r?n=i.applyCanBeUsed.uint8array:"nodebuffer"===r&&(n=i.applyCanBeUsed.nodebuffer),n)for(;1<t;)try{return i.stringifyByChunk(e,r,t)}catch(e){t=Math.floor(t/2)}return i.stringifyByChar(e)}function f(e,t){for(var r=0;r<e.length;r++)t[r]=e[r];return t}a.applyFromCharCode=s;var c={};c.string={string:n,array:function(e){return l(e,new Array(e.length))},arraybuffer:function(e){return c.string.uint8array(e).buffer},uint8array:function(e){return l(e,new Uint8Array(e.length))},nodebuffer:function(e){return l(e,r.allocBuffer(e.length))}},c.array={string:s,array:n,arraybuffer:function(e){return new Uint8Array(e).buffer},uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(e)}},c.arraybuffer={string:function(e){return s(new Uint8Array(e))},array:function(e){return f(new Uint8Array(e),new Array(e.byteLength))},arraybuffer:n,uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(new Uint8Array(e))}},c.uint8array={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return e.buffer},uint8array:n,nodebuffer:function(e){return r.newBufferFrom(e)}},c.nodebuffer={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return c.nodebuffer.uint8array(e).buffer},uint8array:function(e){return f(e,new Uint8Array(e.length))},nodebuffer:n},a.transformTo=function(e,t){if(t=t||"",!e)return t;a.checkSupport(e);var r=a.getTypeOf(t);return c[r][e](t)},a.resolve=function(e){for(var t=e.split("/"),r=[],n=0;n<t.length;n++){var i=t[n];"."===i||""===i&&0!==n&&n!==t.length-1||(".."===i?r.pop():r.push(i))}return r.join("/")},a.getTypeOf=function(e){return"string"==typeof e?"string":"[object Array]"===Object.prototype.toString.call(e)?"array":o.nodebuffer&&r.isBuffer(e)?"nodebuffer":o.uint8array&&e instanceof Uint8Array?"uint8array":o.arraybuffer&&e instanceof ArrayBuffer?"arraybuffer":void 0},a.checkSupport=function(e){if(!o[e.toLowerCase()])throw new Error(e+" is not supported by this platform")},a.MAX_VALUE_16BITS=65535,a.MAX_VALUE_32BITS=-1,a.pretty=function(e){var t,r,n="";for(r=0;r<(e||"").length;r++)n+="\\x"+((t=e.charCodeAt(r))<16?"0":"")+t.toString(16).toUpperCase();return n},a.delay=function(e,t,r){setImmediate(function(){e.apply(r||null,t||[])})},a.inherits=function(e,t){function r(){}r.prototype=t.prototype,e.prototype=new r},a.extend=function(){var e,t,r={};for(e=0;e<arguments.length;e++)for(t in arguments[e])Object.prototype.hasOwnProperty.call(arguments[e],t)&&void 0===r[t]&&(r[t]=arguments[e][t]);return r},a.prepareContent=function(r,e,n,i,s){return u.Promise.resolve(e).then(function(n){return o.blob&&(n instanceof Blob||-1!==["[object File]","[object Blob]"].indexOf(Object.prototype.toString.call(n)))&&"undefined"!=typeof FileReader?new u.Promise(function(t,r){var e=new FileReader;e.onload=function(e){t(e.target.result)},e.onerror=function(e){r(e.target.error)},e.readAsArrayBuffer(n)}):n}).then(function(e){var t=a.getTypeOf(e);return t?("arraybuffer"===t?e=a.transformTo("uint8array",e):"string"===t&&(s?e=h.decode(e):n&&!0!==i&&(e=function(e){return l(e,o.uint8array?new Uint8Array(e.length):new Array(e.length))}(e))),e):u.Promise.reject(new Error("Can't read the data of '"+r+"'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"))})}},{"./base64":1,"./external":6,"./nodejsUtils":14,"./support":30,setimmediate:54}],33:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),i=e("./utils"),s=e("./signature"),a=e("./zipEntry"),o=e("./support");function h(e){this.files=[],this.loadOptions=e}h.prototype={checkSignature:function(e){if(!this.reader.readAndCheckSignature(e)){this.reader.index-=4;var t=this.reader.readString(4);throw new Error("Corrupted zip or bug: unexpected signature ("+i.pretty(t)+", expected "+i.pretty(e)+")")}},isSignature:function(e,t){var r=this.reader.index;this.reader.setIndex(e);var n=this.reader.readString(4)===t;return this.reader.setIndex(r),n},readBlockEndOfCentral:function(){this.diskNumber=this.reader.readInt(2),this.diskWithCentralDirStart=this.reader.readInt(2),this.centralDirRecordsOnThisDisk=this.reader.readInt(2),this.centralDirRecords=this.reader.readInt(2),this.centralDirSize=this.reader.readInt(4),this.centralDirOffset=this.reader.readInt(4),this.zipCommentLength=this.reader.readInt(2);var e=this.reader.readData(this.zipCommentLength),t=o.uint8array?"uint8array":"array",r=i.transformTo(t,e);this.zipComment=this.loadOptions.decodeFileName(r)},readBlockZip64EndOfCentral:function(){this.zip64EndOfCentralSize=this.reader.readInt(8),this.reader.skip(4),this.diskNumber=this.reader.readInt(4),this.diskWithCentralDirStart=this.reader.readInt(4),this.centralDirRecordsOnThisDisk=this.reader.readInt(8),this.centralDirRecords=this.reader.readInt(8),this.centralDirSize=this.reader.readInt(8),this.centralDirOffset=this.reader.readInt(8),this.zip64ExtensibleData={};for(var e,t,r,n=this.zip64EndOfCentralSize-44;0<n;)e=this.reader.readInt(2),t=this.reader.readInt(4),r=this.reader.readData(t),this.zip64ExtensibleData[e]={id:e,length:t,value:r}},readBlockZip64EndOfCentralLocator:function(){if(this.diskWithZip64CentralDirStart=this.reader.readInt(4),this.relativeOffsetEndOfZip64CentralDir=this.reader.readInt(8),this.disksCount=this.reader.readInt(4),1<this.disksCount)throw new Error("Multi-volumes zip are not supported")},readLocalFiles:function(){var e,t;for(e=0;e<this.files.length;e++)t=this.files[e],this.reader.setIndex(t.localHeaderOffset),this.checkSignature(s.LOCAL_FILE_HEADER),t.readLocalPart(this.reader),t.handleUTF8(),t.processAttributes()},readCentralDir:function(){var e;for(this.reader.setIndex(this.centralDirOffset);this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER);)(e=new a({zip64:this.zip64},this.loadOptions)).readCentralPart(this.reader),this.files.push(e);if(this.centralDirRecords!==this.files.length&&0!==this.centralDirRecords&&0===this.files.length)throw new Error("Corrupted zip or bug: expected "+this.centralDirRecords+" records in central dir, got "+this.files.length)},readEndOfCentral:function(){var e=this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);if(e<0)throw!this.isSignature(0,s.LOCAL_FILE_HEADER)?new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html"):new Error("Corrupted zip: can't find end of central directory");this.reader.setIndex(e);var t=e;if(this.checkSignature(s.CENTRAL_DIRECTORY_END),this.readBlockEndOfCentral(),this.diskNumber===i.MAX_VALUE_16BITS||this.diskWithCentralDirStart===i.MAX_VALUE_16BITS||this.centralDirRecordsOnThisDisk===i.MAX_VALUE_16BITS||this.centralDirRecords===i.MAX_VALUE_16BITS||this.centralDirSize===i.MAX_VALUE_32BITS||this.centralDirOffset===i.MAX_VALUE_32BITS){if(this.zip64=!0,(e=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR))<0)throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");if(this.reader.setIndex(e),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR),this.readBlockZip64EndOfCentralLocator(),!this.isSignature(this.relativeOffsetEndOfZip64CentralDir,s.ZIP64_CENTRAL_DIRECTORY_END)&&(this.relativeOffsetEndOfZip64CentralDir=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.relativeOffsetEndOfZip64CentralDir<0))throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.readBlockZip64EndOfCentral()}var r=this.centralDirOffset+this.centralDirSize;this.zip64&&(r+=20,r+=12+this.zip64EndOfCentralSize);var n=t-r;if(0<n)this.isSignature(t,s.CENTRAL_FILE_HEADER)||(this.reader.zero=n);else if(n<0)throw new Error("Corrupted zip: missing "+Math.abs(n)+" bytes.")},prepareReader:function(e){this.reader=n(e)},load:function(e){this.prepareReader(e),this.readEndOfCentral(),this.readCentralDir(),this.readLocalFiles()}},t.exports=h},{"./reader/readerFor":22,"./signature":23,"./support":30,"./utils":32,"./zipEntry":34}],34:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),s=e("./utils"),i=e("./compressedObject"),a=e("./crc32"),o=e("./utf8"),h=e("./compressions"),u=e("./support");function l(e,t){this.options=e,this.loadOptions=t}l.prototype={isEncrypted:function(){return 1==(1&this.bitFlag)},useUTF8:function(){return 2048==(2048&this.bitFlag)},readLocalPart:function(e){var t,r;if(e.skip(22),this.fileNameLength=e.readInt(2),r=e.readInt(2),this.fileName=e.readData(this.fileNameLength),e.skip(r),-1===this.compressedSize||-1===this.uncompressedSize)throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");if(null===(t=function(e){for(var t in h)if(Object.prototype.hasOwnProperty.call(h,t)&&h[t].magic===e)return h[t];return null}(this.compressionMethod)))throw new Error("Corrupted zip : compression "+s.pretty(this.compressionMethod)+" unknown (inner file : "+s.transformTo("string",this.fileName)+")");this.decompressed=new i(this.compressedSize,this.uncompressedSize,this.crc32,t,e.readData(this.compressedSize))},readCentralPart:function(e){this.versionMadeBy=e.readInt(2),e.skip(2),this.bitFlag=e.readInt(2),this.compressionMethod=e.readString(2),this.date=e.readDate(),this.crc32=e.readInt(4),this.compressedSize=e.readInt(4),this.uncompressedSize=e.readInt(4);var t=e.readInt(2);if(this.extraFieldsLength=e.readInt(2),this.fileCommentLength=e.readInt(2),this.diskNumberStart=e.readInt(2),this.internalFileAttributes=e.readInt(2),this.externalFileAttributes=e.readInt(4),this.localHeaderOffset=e.readInt(4),this.isEncrypted())throw new Error("Encrypted zip are not supported");e.skip(t),this.readExtraFields(e),this.parseZIP64ExtraField(e),this.fileComment=e.readData(this.fileCommentLength)},processAttributes:function(){this.unixPermissions=null,this.dosPermissions=null;var e=this.versionMadeBy>>8;this.dir=!!(16&this.externalFileAttributes),0==e&&(this.dosPermissions=63&this.externalFileAttributes),3==e&&(this.unixPermissions=this.externalFileAttributes>>16&65535),this.dir||"/"!==this.fileNameStr.slice(-1)||(this.dir=!0)},parseZIP64ExtraField:function(){if(this.extraFields[1]){var e=n(this.extraFields[1].value);this.uncompressedSize===s.MAX_VALUE_32BITS&&(this.uncompressedSize=e.readInt(8)),this.compressedSize===s.MAX_VALUE_32BITS&&(this.compressedSize=e.readInt(8)),this.localHeaderOffset===s.MAX_VALUE_32BITS&&(this.localHeaderOffset=e.readInt(8)),this.diskNumberStart===s.MAX_VALUE_32BITS&&(this.diskNumberStart=e.readInt(4))}},readExtraFields:function(e){var t,r,n,i=e.index+this.extraFieldsLength;for(this.extraFields||(this.extraFields={});e.index+4<i;)t=e.readInt(2),r=e.readInt(2),n=e.readData(r),this.extraFields[t]={id:t,length:r,value:n};e.setIndex(i)},handleUTF8:function(){var e=u.uint8array?"uint8array":"array";if(this.useUTF8())this.fileNameStr=o.utf8decode(this.fileName),this.fileCommentStr=o.utf8decode(this.fileComment);else{var t=this.findExtraFieldUnicodePath();if(null!==t)this.fileNameStr=t;else{var r=s.transformTo(e,this.fileName);this.fileNameStr=this.loadOptions.decodeFileName(r)}var n=this.findExtraFieldUnicodeComment();if(null!==n)this.fileCommentStr=n;else{var i=s.transformTo(e,this.fileComment);this.fileCommentStr=this.loadOptions.decodeFileName(i)}}},findExtraFieldUnicodePath:function(){var e=this.extraFields[28789];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileName)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null},findExtraFieldUnicodeComment:function(){var e=this.extraFields[25461];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileComment)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null}},t.exports=l},{"./compressedObject":2,"./compressions":3,"./crc32":4,"./reader/readerFor":22,"./support":30,"./utf8":31,"./utils":32}],35:[function(e,t,r){"use strict";function n(e,t,r){this.name=e,this.dir=r.dir,this.date=r.date,this.comment=r.comment,this.unixPermissions=r.unixPermissions,this.dosPermissions=r.dosPermissions,this._data=t,this._dataBinary=r.binary,this.options={compression:r.compression,compressionOptions:r.compressionOptions}}var s=e("./stream/StreamHelper"),i=e("./stream/DataWorker"),a=e("./utf8"),o=e("./compressedObject"),h=e("./stream/GenericWorker");n.prototype={internalStream:function(e){var t=null,r="string";try{if(!e)throw new Error("No output type specified.");var n="string"===(r=e.toLowerCase())||"text"===r;"binarystring"!==r&&"text"!==r||(r="string"),t=this._decompressWorker();var i=!this._dataBinary;i&&!n&&(t=t.pipe(new a.Utf8EncodeWorker)),!i&&n&&(t=t.pipe(new a.Utf8DecodeWorker))}catch(e){(t=new h("error")).error(e)}return new s(t,r,"")},async:function(e,t){return this.internalStream(e).accumulate(t)},nodeStream:function(e,t){return this.internalStream(e||"nodebuffer").toNodejsStream(t)},_compressWorker:function(e,t){if(this._data instanceof o&&this._data.compression.magic===e.magic)return this._data.getCompressedWorker();var r=this._decompressWorker();return this._dataBinary||(r=r.pipe(new a.Utf8EncodeWorker)),o.createWorkerFrom(r,e,t)},_decompressWorker:function(){return this._data instanceof o?this._data.getContentWorker():this._data instanceof h?this._data:new i(this._data)}};for(var u=["asText","asBinary","asNodeBuffer","asUint8Array","asArrayBuffer"],l=function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},f=0;f<u.length;f++)n.prototype[u[f]]=l;t.exports=n},{"./compressedObject":2,"./stream/DataWorker":27,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31}],36:[function(e,l,t){(function(t){"use strict";var r,n,e=t.MutationObserver||t.WebKitMutationObserver;if(e){var i=0,s=new e(u),a=t.document.createTextNode("");s.observe(a,{characterData:!0}),r=function(){a.data=i=++i%2}}else if(t.setImmediate||void 0===t.MessageChannel)r="document"in t&&"onreadystatechange"in t.document.createElement("script")?function(){var e=t.document.createElement("script");e.onreadystatechange=function(){u(),e.onreadystatechange=null,e.parentNode.removeChild(e),e=null},t.document.documentElement.appendChild(e)}:function(){setTimeout(u,0)};else{var o=new t.MessageChannel;o.port1.onmessage=u,r=function(){o.port2.postMessage(0)}}var h=[];function u(){var e,t;n=!0;for(var r=h.length;r;){for(t=h,h=[],e=-1;++e<r;)t[e]();r=h.length}n=!1}l.exports=function(e){1!==h.push(e)||n||r()}}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],37:[function(e,t,r){"use strict";var i=e("immediate");function u(){}var l={},s=["REJECTED"],a=["FULFILLED"],n=["PENDING"];function o(e){if("function"!=typeof e)throw new TypeError("resolver must be a function");this.state=n,this.queue=[],this.outcome=void 0,e!==u&&d(this,e)}function h(e,t,r){this.promise=e,"function"==typeof t&&(this.onFulfilled=t,this.callFulfilled=this.otherCallFulfilled),"function"==typeof r&&(this.onRejected=r,this.callRejected=this.otherCallRejected)}function f(t,r,n){i(function(){var e;try{e=r(n)}catch(e){return l.reject(t,e)}e===t?l.reject(t,new TypeError("Cannot resolve promise with itself")):l.resolve(t,e)})}function c(e){var t=e&&e.then;if(e&&("object"==typeof e||"function"==typeof e)&&"function"==typeof t)return function(){t.apply(e,arguments)}}function d(t,e){var r=!1;function n(e){r||(r=!0,l.reject(t,e))}function i(e){r||(r=!0,l.resolve(t,e))}var s=p(function(){e(i,n)});"error"===s.status&&n(s.value)}function p(e,t){var r={};try{r.value=e(t),r.status="success"}catch(e){r.status="error",r.value=e}return r}(t.exports=o).prototype.finally=function(t){if("function"!=typeof t)return this;var r=this.constructor;return this.then(function(e){return r.resolve(t()).then(function(){return e})},function(e){return r.resolve(t()).then(function(){throw e})})},o.prototype.catch=function(e){return this.then(null,e)},o.prototype.then=function(e,t){if("function"!=typeof e&&this.state===a||"function"!=typeof t&&this.state===s)return this;var r=new this.constructor(u);this.state!==n?f(r,this.state===a?e:t,this.outcome):this.queue.push(new h(r,e,t));return r},h.prototype.callFulfilled=function(e){l.resolve(this.promise,e)},h.prototype.otherCallFulfilled=function(e){f(this.promise,this.onFulfilled,e)},h.prototype.callRejected=function(e){l.reject(this.promise,e)},h.prototype.otherCallRejected=function(e){f(this.promise,this.onRejected,e)},l.resolve=function(e,t){var r=p(c,t);if("error"===r.status)return l.reject(e,r.value);var n=r.value;if(n)d(e,n);else{e.state=a,e.outcome=t;for(var i=-1,s=e.queue.length;++i<s;)e.queue[i].callFulfilled(t)}return e},l.reject=function(e,t){e.state=s,e.outcome=t;for(var r=-1,n=e.queue.length;++r<n;)e.queue[r].callRejected(t);return e},o.resolve=function(e){if(e instanceof this)return e;return l.resolve(new this(u),e)},o.reject=function(e){var t=new this(u);return l.reject(t,e)},o.all=function(e){var r=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var n=e.length,i=!1;if(!n)return this.resolve([]);var s=new Array(n),a=0,t=-1,o=new this(u);for(;++t<n;)h(e[t],t);return o;function h(e,t){r.resolve(e).then(function(e){s[t]=e,++a!==n||i||(i=!0,l.resolve(o,s))},function(e){i||(i=!0,l.reject(o,e))})}},o.race=function(e){var t=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var r=e.length,n=!1;if(!r)return this.resolve([]);var i=-1,s=new this(u);for(;++i<r;)a=e[i],t.resolve(a).then(function(e){n||(n=!0,l.resolve(s,e))},function(e){n||(n=!0,l.reject(s,e))});var a;return s}},{immediate:36}],38:[function(e,t,r){"use strict";var n={};(0,e("./lib/utils/common").assign)(n,e("./lib/deflate"),e("./lib/inflate"),e("./lib/zlib/constants")),t.exports=n},{"./lib/deflate":39,"./lib/inflate":40,"./lib/utils/common":41,"./lib/zlib/constants":44}],39:[function(e,t,r){"use strict";var a=e("./zlib/deflate"),o=e("./utils/common"),h=e("./utils/strings"),i=e("./zlib/messages"),s=e("./zlib/zstream"),u=Object.prototype.toString,l=0,f=-1,c=0,d=8;function p(e){if(!(this instanceof p))return new p(e);this.options=o.assign({level:f,method:d,chunkSize:16384,windowBits:15,memLevel:8,strategy:c,to:""},e||{});var t=this.options;t.raw&&0<t.windowBits?t.windowBits=-t.windowBits:t.gzip&&0<t.windowBits&&t.windowBits<16&&(t.windowBits+=16),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new s,this.strm.avail_out=0;var r=a.deflateInit2(this.strm,t.level,t.method,t.windowBits,t.memLevel,t.strategy);if(r!==l)throw new Error(i[r]);if(t.header&&a.deflateSetHeader(this.strm,t.header),t.dictionary){var n;if(n="string"==typeof t.dictionary?h.string2buf(t.dictionary):"[object ArrayBuffer]"===u.call(t.dictionary)?new Uint8Array(t.dictionary):t.dictionary,(r=a.deflateSetDictionary(this.strm,n))!==l)throw new Error(i[r]);this._dict_set=!0}}function n(e,t){var r=new p(t);if(r.push(e,!0),r.err)throw r.msg||i[r.err];return r.result}p.prototype.push=function(e,t){var r,n,i=this.strm,s=this.options.chunkSize;if(this.ended)return!1;n=t===~~t?t:!0===t?4:0,"string"==typeof e?i.input=h.string2buf(e):"[object ArrayBuffer]"===u.call(e)?i.input=new Uint8Array(e):i.input=e,i.next_in=0,i.avail_in=i.input.length;do{if(0===i.avail_out&&(i.output=new o.Buf8(s),i.next_out=0,i.avail_out=s),1!==(r=a.deflate(i,n))&&r!==l)return this.onEnd(r),!(this.ended=!0);0!==i.avail_out&&(0!==i.avail_in||4!==n&&2!==n)||("string"===this.options.to?this.onData(h.buf2binstring(o.shrinkBuf(i.output,i.next_out))):this.onData(o.shrinkBuf(i.output,i.next_out)))}while((0<i.avail_in||0===i.avail_out)&&1!==r);return 4===n?(r=a.deflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===l):2!==n||(this.onEnd(l),!(i.avail_out=0))},p.prototype.onData=function(e){this.chunks.push(e)},p.prototype.onEnd=function(e){e===l&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=o.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Deflate=p,r.deflate=n,r.deflateRaw=function(e,t){return(t=t||{}).raw=!0,n(e,t)},r.gzip=function(e,t){return(t=t||{}).gzip=!0,n(e,t)}},{"./utils/common":41,"./utils/strings":42,"./zlib/deflate":46,"./zlib/messages":51,"./zlib/zstream":53}],40:[function(e,t,r){"use strict";var c=e("./zlib/inflate"),d=e("./utils/common"),p=e("./utils/strings"),m=e("./zlib/constants"),n=e("./zlib/messages"),i=e("./zlib/zstream"),s=e("./zlib/gzheader"),_=Object.prototype.toString;function a(e){if(!(this instanceof a))return new a(e);this.options=d.assign({chunkSize:16384,windowBits:0,to:""},e||{});var t=this.options;t.raw&&0<=t.windowBits&&t.windowBits<16&&(t.windowBits=-t.windowBits,0===t.windowBits&&(t.windowBits=-15)),!(0<=t.windowBits&&t.windowBits<16)||e&&e.windowBits||(t.windowBits+=32),15<t.windowBits&&t.windowBits<48&&0==(15&t.windowBits)&&(t.windowBits|=15),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new i,this.strm.avail_out=0;var r=c.inflateInit2(this.strm,t.windowBits);if(r!==m.Z_OK)throw new Error(n[r]);this.header=new s,c.inflateGetHeader(this.strm,this.header)}function o(e,t){var r=new a(t);if(r.push(e,!0),r.err)throw r.msg||n[r.err];return r.result}a.prototype.push=function(e,t){var r,n,i,s,a,o,h=this.strm,u=this.options.chunkSize,l=this.options.dictionary,f=!1;if(this.ended)return!1;n=t===~~t?t:!0===t?m.Z_FINISH:m.Z_NO_FLUSH,"string"==typeof e?h.input=p.binstring2buf(e):"[object ArrayBuffer]"===_.call(e)?h.input=new Uint8Array(e):h.input=e,h.next_in=0,h.avail_in=h.input.length;do{if(0===h.avail_out&&(h.output=new d.Buf8(u),h.next_out=0,h.avail_out=u),(r=c.inflate(h,m.Z_NO_FLUSH))===m.Z_NEED_DICT&&l&&(o="string"==typeof l?p.string2buf(l):"[object ArrayBuffer]"===_.call(l)?new Uint8Array(l):l,r=c.inflateSetDictionary(this.strm,o)),r===m.Z_BUF_ERROR&&!0===f&&(r=m.Z_OK,f=!1),r!==m.Z_STREAM_END&&r!==m.Z_OK)return this.onEnd(r),!(this.ended=!0);h.next_out&&(0!==h.avail_out&&r!==m.Z_STREAM_END&&(0!==h.avail_in||n!==m.Z_FINISH&&n!==m.Z_SYNC_FLUSH)||("string"===this.options.to?(i=p.utf8border(h.output,h.next_out),s=h.next_out-i,a=p.buf2string(h.output,i),h.next_out=s,h.avail_out=u-s,s&&d.arraySet(h.output,h.output,i,s,0),this.onData(a)):this.onData(d.shrinkBuf(h.output,h.next_out)))),0===h.avail_in&&0===h.avail_out&&(f=!0)}while((0<h.avail_in||0===h.avail_out)&&r!==m.Z_STREAM_END);return r===m.Z_STREAM_END&&(n=m.Z_FINISH),n===m.Z_FINISH?(r=c.inflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===m.Z_OK):n!==m.Z_SYNC_FLUSH||(this.onEnd(m.Z_OK),!(h.avail_out=0))},a.prototype.onData=function(e){this.chunks.push(e)},a.prototype.onEnd=function(e){e===m.Z_OK&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=d.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Inflate=a,r.inflate=o,r.inflateRaw=function(e,t){return(t=t||{}).raw=!0,o(e,t)},r.ungzip=o},{"./utils/common":41,"./utils/strings":42,"./zlib/constants":44,"./zlib/gzheader":47,"./zlib/inflate":49,"./zlib/messages":51,"./zlib/zstream":53}],41:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Int32Array;r.assign=function(e){for(var t=Array.prototype.slice.call(arguments,1);t.length;){var r=t.shift();if(r){if("object"!=typeof r)throw new TypeError(r+"must be non-object");for(var n in r)r.hasOwnProperty(n)&&(e[n]=r[n])}}return e},r.shrinkBuf=function(e,t){return e.length===t?e:e.subarray?e.subarray(0,t):(e.length=t,e)};var i={arraySet:function(e,t,r,n,i){if(t.subarray&&e.subarray)e.set(t.subarray(r,r+n),i);else for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){var t,r,n,i,s,a;for(t=n=0,r=e.length;t<r;t++)n+=e[t].length;for(a=new Uint8Array(n),t=i=0,r=e.length;t<r;t++)s=e[t],a.set(s,i),i+=s.length;return a}},s={arraySet:function(e,t,r,n,i){for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){return[].concat.apply([],e)}};r.setTyped=function(e){e?(r.Buf8=Uint8Array,r.Buf16=Uint16Array,r.Buf32=Int32Array,r.assign(r,i)):(r.Buf8=Array,r.Buf16=Array,r.Buf32=Array,r.assign(r,s))},r.setTyped(n)},{}],42:[function(e,t,r){"use strict";var h=e("./common"),i=!0,s=!0;try{String.fromCharCode.apply(null,[0])}catch(e){i=!1}try{String.fromCharCode.apply(null,new Uint8Array(1))}catch(e){s=!1}for(var u=new h.Buf8(256),n=0;n<256;n++)u[n]=252<=n?6:248<=n?5:240<=n?4:224<=n?3:192<=n?2:1;function l(e,t){if(t<65537&&(e.subarray&&s||!e.subarray&&i))return String.fromCharCode.apply(null,h.shrinkBuf(e,t));for(var r="",n=0;n<t;n++)r+=String.fromCharCode(e[n]);return r}u[254]=u[254]=1,r.string2buf=function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=new h.Buf8(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t},r.buf2binstring=function(e){return l(e,e.length)},r.binstring2buf=function(e){for(var t=new h.Buf8(e.length),r=0,n=t.length;r<n;r++)t[r]=e.charCodeAt(r);return t},r.buf2string=function(e,t){var r,n,i,s,a=t||e.length,o=new Array(2*a);for(r=n=0;r<a;)if((i=e[r++])<128)o[n++]=i;else if(4<(s=u[i]))o[n++]=65533,r+=s-1;else{for(i&=2===s?31:3===s?15:7;1<s&&r<a;)i=i<<6|63&e[r++],s--;1<s?o[n++]=65533:i<65536?o[n++]=i:(i-=65536,o[n++]=55296|i>>10&1023,o[n++]=56320|1023&i)}return l(o,n)},r.utf8border=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}},{"./common":41}],43:[function(e,t,r){"use strict";t.exports=function(e,t,r,n){for(var i=65535&e|0,s=e>>>16&65535|0,a=0;0!==r;){for(r-=a=2e3<r?2e3:r;s=s+(i=i+t[n++]|0)|0,--a;);i%=65521,s%=65521}return i|s<<16|0}},{}],44:[function(e,t,r){"use strict";t.exports={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8}},{}],45:[function(e,t,r){"use strict";var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}},{}],46:[function(e,t,r){"use strict";var h,c=e("../utils/common"),u=e("./trees"),d=e("./adler32"),p=e("./crc32"),n=e("./messages"),l=0,f=4,m=0,_=-2,g=-1,b=4,i=2,v=8,y=9,s=286,a=30,o=19,w=2*s+1,k=15,x=3,S=258,z=S+x+1,C=42,E=113,A=1,I=2,O=3,B=4;function R(e,t){return e.msg=n[t],t}function T(e){return(e<<1)-(4<e?9:0)}function D(e){for(var t=e.length;0<=--t;)e[t]=0}function F(e){var t=e.state,r=t.pending;r>e.avail_out&&(r=e.avail_out),0!==r&&(c.arraySet(e.output,t.pending_buf,t.pending_out,r,e.next_out),e.next_out+=r,t.pending_out+=r,e.total_out+=r,e.avail_out-=r,t.pending-=r,0===t.pending&&(t.pending_out=0))}function N(e,t){u._tr_flush_block(e,0<=e.block_start?e.block_start:-1,e.strstart-e.block_start,t),e.block_start=e.strstart,F(e.strm)}function U(e,t){e.pending_buf[e.pending++]=t}function P(e,t){e.pending_buf[e.pending++]=t>>>8&255,e.pending_buf[e.pending++]=255&t}function L(e,t){var r,n,i=e.max_chain_length,s=e.strstart,a=e.prev_length,o=e.nice_match,h=e.strstart>e.w_size-z?e.strstart-(e.w_size-z):0,u=e.window,l=e.w_mask,f=e.prev,c=e.strstart+S,d=u[s+a-1],p=u[s+a];e.prev_length>=e.good_match&&(i>>=2),o>e.lookahead&&(o=e.lookahead);do{if(u[(r=t)+a]===p&&u[r+a-1]===d&&u[r]===u[s]&&u[++r]===u[s+1]){s+=2,r++;do{}while(u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&s<c);if(n=S-(c-s),s=c-S,a<n){if(e.match_start=t,o<=(a=n))break;d=u[s+a-1],p=u[s+a]}}}while((t=f[t&l])>h&&0!=--i);return a<=e.lookahead?a:e.lookahead}function j(e){var t,r,n,i,s,a,o,h,u,l,f=e.w_size;do{if(i=e.window_size-e.lookahead-e.strstart,e.strstart>=f+(f-z)){for(c.arraySet(e.window,e.window,f,f,0),e.match_start-=f,e.strstart-=f,e.block_start-=f,t=r=e.hash_size;n=e.head[--t],e.head[t]=f<=n?n-f:0,--r;);for(t=r=f;n=e.prev[--t],e.prev[t]=f<=n?n-f:0,--r;);i+=f}if(0===e.strm.avail_in)break;if(a=e.strm,o=e.window,h=e.strstart+e.lookahead,u=i,l=void 0,l=a.avail_in,u<l&&(l=u),r=0===l?0:(a.avail_in-=l,c.arraySet(o,a.input,a.next_in,l,h),1===a.state.wrap?a.adler=d(a.adler,o,l,h):2===a.state.wrap&&(a.adler=p(a.adler,o,l,h)),a.next_in+=l,a.total_in+=l,l),e.lookahead+=r,e.lookahead+e.insert>=x)for(s=e.strstart-e.insert,e.ins_h=e.window[s],e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+1])&e.hash_mask;e.insert&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+x-1])&e.hash_mask,e.prev[s&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=s,s++,e.insert--,!(e.lookahead+e.insert<x)););}while(e.lookahead<z&&0!==e.strm.avail_in)}function Z(e,t){for(var r,n;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!==r&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r)),e.match_length>=x)if(n=u._tr_tally(e,e.strstart-e.match_start,e.match_length-x),e.lookahead-=e.match_length,e.match_length<=e.max_lazy_match&&e.lookahead>=x){for(e.match_length--;e.strstart++,e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart,0!=--e.match_length;);e.strstart++}else e.strstart+=e.match_length,e.match_length=0,e.ins_h=e.window[e.strstart],e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+1])&e.hash_mask;else n=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++;if(n&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function W(e,t){for(var r,n,i;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),e.prev_length=e.match_length,e.prev_match=e.match_start,e.match_length=x-1,0!==r&&e.prev_length<e.max_lazy_match&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r),e.match_length<=5&&(1===e.strategy||e.match_length===x&&4096<e.strstart-e.match_start)&&(e.match_length=x-1)),e.prev_length>=x&&e.match_length<=e.prev_length){for(i=e.strstart+e.lookahead-x,n=u._tr_tally(e,e.strstart-1-e.prev_match,e.prev_length-x),e.lookahead-=e.prev_length-1,e.prev_length-=2;++e.strstart<=i&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!=--e.prev_length;);if(e.match_available=0,e.match_length=x-1,e.strstart++,n&&(N(e,!1),0===e.strm.avail_out))return A}else if(e.match_available){if((n=u._tr_tally(e,0,e.window[e.strstart-1]))&&N(e,!1),e.strstart++,e.lookahead--,0===e.strm.avail_out)return A}else e.match_available=1,e.strstart++,e.lookahead--}return e.match_available&&(n=u._tr_tally(e,0,e.window[e.strstart-1]),e.match_available=0),e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function M(e,t,r,n,i){this.good_length=e,this.max_lazy=t,this.nice_length=r,this.max_chain=n,this.func=i}function H(){this.strm=null,this.status=0,this.pending_buf=null,this.pending_buf_size=0,this.pending_out=0,this.pending=0,this.wrap=0,this.gzhead=null,this.gzindex=0,this.method=v,this.last_flush=-1,this.w_size=0,this.w_bits=0,this.w_mask=0,this.window=null,this.window_size=0,this.prev=null,this.head=null,this.ins_h=0,this.hash_size=0,this.hash_bits=0,this.hash_mask=0,this.hash_shift=0,this.block_start=0,this.match_length=0,this.prev_match=0,this.match_available=0,this.strstart=0,this.match_start=0,this.lookahead=0,this.prev_length=0,this.max_chain_length=0,this.max_lazy_match=0,this.level=0,this.strategy=0,this.good_match=0,this.nice_match=0,this.dyn_ltree=new c.Buf16(2*w),this.dyn_dtree=new c.Buf16(2*(2*a+1)),this.bl_tree=new c.Buf16(2*(2*o+1)),D(this.dyn_ltree),D(this.dyn_dtree),D(this.bl_tree),this.l_desc=null,this.d_desc=null,this.bl_desc=null,this.bl_count=new c.Buf16(k+1),this.heap=new c.Buf16(2*s+1),D(this.heap),this.heap_len=0,this.heap_max=0,this.depth=new c.Buf16(2*s+1),D(this.depth),this.l_buf=0,this.lit_bufsize=0,this.last_lit=0,this.d_buf=0,this.opt_len=0,this.static_len=0,this.matches=0,this.insert=0,this.bi_buf=0,this.bi_valid=0}function G(e){var t;return e&&e.state?(e.total_in=e.total_out=0,e.data_type=i,(t=e.state).pending=0,t.pending_out=0,t.wrap<0&&(t.wrap=-t.wrap),t.status=t.wrap?C:E,e.adler=2===t.wrap?0:1,t.last_flush=l,u._tr_init(t),m):R(e,_)}function K(e){var t=G(e);return t===m&&function(e){e.window_size=2*e.w_size,D(e.head),e.max_lazy_match=h[e.level].max_lazy,e.good_match=h[e.level].good_length,e.nice_match=h[e.level].nice_length,e.max_chain_length=h[e.level].max_chain,e.strstart=0,e.block_start=0,e.lookahead=0,e.insert=0,e.match_length=e.prev_length=x-1,e.match_available=0,e.ins_h=0}(e.state),t}function Y(e,t,r,n,i,s){if(!e)return _;var a=1;if(t===g&&(t=6),n<0?(a=0,n=-n):15<n&&(a=2,n-=16),i<1||y<i||r!==v||n<8||15<n||t<0||9<t||s<0||b<s)return R(e,_);8===n&&(n=9);var o=new H;return(e.state=o).strm=e,o.wrap=a,o.gzhead=null,o.w_bits=n,o.w_size=1<<o.w_bits,o.w_mask=o.w_size-1,o.hash_bits=i+7,o.hash_size=1<<o.hash_bits,o.hash_mask=o.hash_size-1,o.hash_shift=~~((o.hash_bits+x-1)/x),o.window=new c.Buf8(2*o.w_size),o.head=new c.Buf16(o.hash_size),o.prev=new c.Buf16(o.w_size),o.lit_bufsize=1<<i+6,o.pending_buf_size=4*o.lit_bufsize,o.pending_buf=new c.Buf8(o.pending_buf_size),o.d_buf=1*o.lit_bufsize,o.l_buf=3*o.lit_bufsize,o.level=t,o.strategy=s,o.method=r,K(e)}h=[new M(0,0,0,0,function(e,t){var r=65535;for(r>e.pending_buf_size-5&&(r=e.pending_buf_size-5);;){if(e.lookahead<=1){if(j(e),0===e.lookahead&&t===l)return A;if(0===e.lookahead)break}e.strstart+=e.lookahead,e.lookahead=0;var n=e.block_start+r;if((0===e.strstart||e.strstart>=n)&&(e.lookahead=e.strstart-n,e.strstart=n,N(e,!1),0===e.strm.avail_out))return A;if(e.strstart-e.block_start>=e.w_size-z&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):(e.strstart>e.block_start&&(N(e,!1),e.strm.avail_out),A)}),new M(4,4,8,4,Z),new M(4,5,16,8,Z),new M(4,6,32,32,Z),new M(4,4,16,16,W),new M(8,16,32,32,W),new M(8,16,128,128,W),new M(8,32,128,256,W),new M(32,128,258,1024,W),new M(32,258,258,4096,W)],r.deflateInit=function(e,t){return Y(e,t,v,15,8,0)},r.deflateInit2=Y,r.deflateReset=K,r.deflateResetKeep=G,r.deflateSetHeader=function(e,t){return e&&e.state?2!==e.state.wrap?_:(e.state.gzhead=t,m):_},r.deflate=function(e,t){var r,n,i,s;if(!e||!e.state||5<t||t<0)return e?R(e,_):_;if(n=e.state,!e.output||!e.input&&0!==e.avail_in||666===n.status&&t!==f)return R(e,0===e.avail_out?-5:_);if(n.strm=e,r=n.last_flush,n.last_flush=t,n.status===C)if(2===n.wrap)e.adler=0,U(n,31),U(n,139),U(n,8),n.gzhead?(U(n,(n.gzhead.text?1:0)+(n.gzhead.hcrc?2:0)+(n.gzhead.extra?4:0)+(n.gzhead.name?8:0)+(n.gzhead.comment?16:0)),U(n,255&n.gzhead.time),U(n,n.gzhead.time>>8&255),U(n,n.gzhead.time>>16&255),U(n,n.gzhead.time>>24&255),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,255&n.gzhead.os),n.gzhead.extra&&n.gzhead.extra.length&&(U(n,255&n.gzhead.extra.length),U(n,n.gzhead.extra.length>>8&255)),n.gzhead.hcrc&&(e.adler=p(e.adler,n.pending_buf,n.pending,0)),n.gzindex=0,n.status=69):(U(n,0),U(n,0),U(n,0),U(n,0),U(n,0),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,3),n.status=E);else{var a=v+(n.w_bits-8<<4)<<8;a|=(2<=n.strategy||n.level<2?0:n.level<6?1:6===n.level?2:3)<<6,0!==n.strstart&&(a|=32),a+=31-a%31,n.status=E,P(n,a),0!==n.strstart&&(P(n,e.adler>>>16),P(n,65535&e.adler)),e.adler=1}if(69===n.status)if(n.gzhead.extra){for(i=n.pending;n.gzindex<(65535&n.gzhead.extra.length)&&(n.pending!==n.pending_buf_size||(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending!==n.pending_buf_size));)U(n,255&n.gzhead.extra[n.gzindex]),n.gzindex++;n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),n.gzindex===n.gzhead.extra.length&&(n.gzindex=0,n.status=73)}else n.status=73;if(73===n.status)if(n.gzhead.name){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.name.length?255&n.gzhead.name.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.gzindex=0,n.status=91)}else n.status=91;if(91===n.status)if(n.gzhead.comment){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.comment.length?255&n.gzhead.comment.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.status=103)}else n.status=103;if(103===n.status&&(n.gzhead.hcrc?(n.pending+2>n.pending_buf_size&&F(e),n.pending+2<=n.pending_buf_size&&(U(n,255&e.adler),U(n,e.adler>>8&255),e.adler=0,n.status=E)):n.status=E),0!==n.pending){if(F(e),0===e.avail_out)return n.last_flush=-1,m}else if(0===e.avail_in&&T(t)<=T(r)&&t!==f)return R(e,-5);if(666===n.status&&0!==e.avail_in)return R(e,-5);if(0!==e.avail_in||0!==n.lookahead||t!==l&&666!==n.status){var o=2===n.strategy?function(e,t){for(var r;;){if(0===e.lookahead&&(j(e),0===e.lookahead)){if(t===l)return A;break}if(e.match_length=0,r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++,r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):3===n.strategy?function(e,t){for(var r,n,i,s,a=e.window;;){if(e.lookahead<=S){if(j(e),e.lookahead<=S&&t===l)return A;if(0===e.lookahead)break}if(e.match_length=0,e.lookahead>=x&&0<e.strstart&&(n=a[i=e.strstart-1])===a[++i]&&n===a[++i]&&n===a[++i]){s=e.strstart+S;do{}while(n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&i<s);e.match_length=S-(s-i),e.match_length>e.lookahead&&(e.match_length=e.lookahead)}if(e.match_length>=x?(r=u._tr_tally(e,1,e.match_length-x),e.lookahead-=e.match_length,e.strstart+=e.match_length,e.match_length=0):(r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++),r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):h[n.level].func(n,t);if(o!==O&&o!==B||(n.status=666),o===A||o===O)return 0===e.avail_out&&(n.last_flush=-1),m;if(o===I&&(1===t?u._tr_align(n):5!==t&&(u._tr_stored_block(n,0,0,!1),3===t&&(D(n.head),0===n.lookahead&&(n.strstart=0,n.block_start=0,n.insert=0))),F(e),0===e.avail_out))return n.last_flush=-1,m}return t!==f?m:n.wrap<=0?1:(2===n.wrap?(U(n,255&e.adler),U(n,e.adler>>8&255),U(n,e.adler>>16&255),U(n,e.adler>>24&255),U(n,255&e.total_in),U(n,e.total_in>>8&255),U(n,e.total_in>>16&255),U(n,e.total_in>>24&255)):(P(n,e.adler>>>16),P(n,65535&e.adler)),F(e),0<n.wrap&&(n.wrap=-n.wrap),0!==n.pending?m:1)},r.deflateEnd=function(e){var t;return e&&e.state?(t=e.state.status)!==C&&69!==t&&73!==t&&91!==t&&103!==t&&t!==E&&666!==t?R(e,_):(e.state=null,t===E?R(e,-3):m):_},r.deflateSetDictionary=function(e,t){var r,n,i,s,a,o,h,u,l=t.length;if(!e||!e.state)return _;if(2===(s=(r=e.state).wrap)||1===s&&r.status!==C||r.lookahead)return _;for(1===s&&(e.adler=d(e.adler,t,l,0)),r.wrap=0,l>=r.w_size&&(0===s&&(D(r.head),r.strstart=0,r.block_start=0,r.insert=0),u=new c.Buf8(r.w_size),c.arraySet(u,t,l-r.w_size,r.w_size,0),t=u,l=r.w_size),a=e.avail_in,o=e.next_in,h=e.input,e.avail_in=l,e.next_in=0,e.input=t,j(r);r.lookahead>=x;){for(n=r.strstart,i=r.lookahead-(x-1);r.ins_h=(r.ins_h<<r.hash_shift^r.window[n+x-1])&r.hash_mask,r.prev[n&r.w_mask]=r.head[r.ins_h],r.head[r.ins_h]=n,n++,--i;);r.strstart=n,r.lookahead=x-1,j(r)}return r.strstart+=r.lookahead,r.block_start=r.strstart,r.insert=r.lookahead,r.lookahead=0,r.match_length=r.prev_length=x-1,r.match_available=0,e.next_in=o,e.input=h,e.avail_in=a,r.wrap=s,m},r.deflateInfo="pako deflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./messages":51,"./trees":52}],47:[function(e,t,r){"use strict";t.exports=function(){this.text=0,this.time=0,this.xflags=0,this.os=0,this.extra=null,this.extra_len=0,this.name="",this.comment="",this.hcrc=0,this.done=!1}},{}],48:[function(e,t,r){"use strict";t.exports=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C;r=e.state,n=e.next_in,z=e.input,i=n+(e.avail_in-5),s=e.next_out,C=e.output,a=s-(t-e.avail_out),o=s+(e.avail_out-257),h=r.dmax,u=r.wsize,l=r.whave,f=r.wnext,c=r.window,d=r.hold,p=r.bits,m=r.lencode,_=r.distcode,g=(1<<r.lenbits)-1,b=(1<<r.distbits)-1;e:do{p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=m[d&g];t:for(;;){if(d>>>=y=v>>>24,p-=y,0===(y=v>>>16&255))C[s++]=65535&v;else{if(!(16&y)){if(0==(64&y)){v=m[(65535&v)+(d&(1<<y)-1)];continue t}if(32&y){r.mode=12;break e}e.msg="invalid literal/length code",r.mode=30;break e}w=65535&v,(y&=15)&&(p<y&&(d+=z[n++]<<p,p+=8),w+=d&(1<<y)-1,d>>>=y,p-=y),p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=_[d&b];r:for(;;){if(d>>>=y=v>>>24,p-=y,!(16&(y=v>>>16&255))){if(0==(64&y)){v=_[(65535&v)+(d&(1<<y)-1)];continue r}e.msg="invalid distance code",r.mode=30;break e}if(k=65535&v,p<(y&=15)&&(d+=z[n++]<<p,(p+=8)<y&&(d+=z[n++]<<p,p+=8)),h<(k+=d&(1<<y)-1)){e.msg="invalid distance too far back",r.mode=30;break e}if(d>>>=y,p-=y,(y=s-a)<k){if(l<(y=k-y)&&r.sane){e.msg="invalid distance too far back",r.mode=30;break e}if(S=c,(x=0)===f){if(x+=u-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}}else if(f<y){if(x+=u+f-y,(y-=f)<w){for(w-=y;C[s++]=c[x++],--y;);if(x=0,f<w){for(w-=y=f;C[s++]=c[x++],--y;);x=s-k,S=C}}}else if(x+=f-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}for(;2<w;)C[s++]=S[x++],C[s++]=S[x++],C[s++]=S[x++],w-=3;w&&(C[s++]=S[x++],1<w&&(C[s++]=S[x++]))}else{for(x=s-k;C[s++]=C[x++],C[s++]=C[x++],C[s++]=C[x++],2<(w-=3););w&&(C[s++]=C[x++],1<w&&(C[s++]=C[x++]))}break}}break}}while(n<i&&s<o);n-=w=p>>3,d&=(1<<(p-=w<<3))-1,e.next_in=n,e.next_out=s,e.avail_in=n<i?i-n+5:5-(n-i),e.avail_out=s<o?o-s+257:257-(s-o),r.hold=d,r.bits=p}},{}],49:[function(e,t,r){"use strict";var I=e("../utils/common"),O=e("./adler32"),B=e("./crc32"),R=e("./inffast"),T=e("./inftrees"),D=1,F=2,N=0,U=-2,P=1,n=852,i=592;function L(e){return(e>>>24&255)+(e>>>8&65280)+((65280&e)<<8)+((255&e)<<24)}function s(){this.mode=0,this.last=!1,this.wrap=0,this.havedict=!1,this.flags=0,this.dmax=0,this.check=0,this.total=0,this.head=null,this.wbits=0,this.wsize=0,this.whave=0,this.wnext=0,this.window=null,this.hold=0,this.bits=0,this.length=0,this.offset=0,this.extra=0,this.lencode=null,this.distcode=null,this.lenbits=0,this.distbits=0,this.ncode=0,this.nlen=0,this.ndist=0,this.have=0,this.next=null,this.lens=new I.Buf16(320),this.work=new I.Buf16(288),this.lendyn=null,this.distdyn=null,this.sane=0,this.back=0,this.was=0}function a(e){var t;return e&&e.state?(t=e.state,e.total_in=e.total_out=t.total=0,e.msg="",t.wrap&&(e.adler=1&t.wrap),t.mode=P,t.last=0,t.havedict=0,t.dmax=32768,t.head=null,t.hold=0,t.bits=0,t.lencode=t.lendyn=new I.Buf32(n),t.distcode=t.distdyn=new I.Buf32(i),t.sane=1,t.back=-1,N):U}function o(e){var t;return e&&e.state?((t=e.state).wsize=0,t.whave=0,t.wnext=0,a(e)):U}function h(e,t){var r,n;return e&&e.state?(n=e.state,t<0?(r=0,t=-t):(r=1+(t>>4),t<48&&(t&=15)),t&&(t<8||15<t)?U:(null!==n.window&&n.wbits!==t&&(n.window=null),n.wrap=r,n.wbits=t,o(e))):U}function u(e,t){var r,n;return e?(n=new s,(e.state=n).window=null,(r=h(e,t))!==N&&(e.state=null),r):U}var l,f,c=!0;function j(e){if(c){var t;for(l=new I.Buf32(512),f=new I.Buf32(32),t=0;t<144;)e.lens[t++]=8;for(;t<256;)e.lens[t++]=9;for(;t<280;)e.lens[t++]=7;for(;t<288;)e.lens[t++]=8;for(T(D,e.lens,0,288,l,0,e.work,{bits:9}),t=0;t<32;)e.lens[t++]=5;T(F,e.lens,0,32,f,0,e.work,{bits:5}),c=!1}e.lencode=l,e.lenbits=9,e.distcode=f,e.distbits=5}function Z(e,t,r,n){var i,s=e.state;return null===s.window&&(s.wsize=1<<s.wbits,s.wnext=0,s.whave=0,s.window=new I.Buf8(s.wsize)),n>=s.wsize?(I.arraySet(s.window,t,r-s.wsize,s.wsize,0),s.wnext=0,s.whave=s.wsize):(n<(i=s.wsize-s.wnext)&&(i=n),I.arraySet(s.window,t,r-n,i,s.wnext),(n-=i)?(I.arraySet(s.window,t,r-n,n,0),s.wnext=n,s.whave=s.wsize):(s.wnext+=i,s.wnext===s.wsize&&(s.wnext=0),s.whave<s.wsize&&(s.whave+=i))),0}r.inflateReset=o,r.inflateReset2=h,r.inflateResetKeep=a,r.inflateInit=function(e){return u(e,15)},r.inflateInit2=u,r.inflate=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C=0,E=new I.Buf8(4),A=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];if(!e||!e.state||!e.output||!e.input&&0!==e.avail_in)return U;12===(r=e.state).mode&&(r.mode=13),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,f=o,c=h,x=N;e:for(;;)switch(r.mode){case P:if(0===r.wrap){r.mode=13;break}for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(2&r.wrap&&35615===u){E[r.check=0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0),l=u=0,r.mode=2;break}if(r.flags=0,r.head&&(r.head.done=!1),!(1&r.wrap)||(((255&u)<<8)+(u>>8))%31){e.msg="incorrect header check",r.mode=30;break}if(8!=(15&u)){e.msg="unknown compression method",r.mode=30;break}if(l-=4,k=8+(15&(u>>>=4)),0===r.wbits)r.wbits=k;else if(k>r.wbits){e.msg="invalid window size",r.mode=30;break}r.dmax=1<<k,e.adler=r.check=1,r.mode=512&u?10:12,l=u=0;break;case 2:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.flags=u,8!=(255&r.flags)){e.msg="unknown compression method",r.mode=30;break}if(57344&r.flags){e.msg="unknown header flags set",r.mode=30;break}r.head&&(r.head.text=u>>8&1),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=3;case 3:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.time=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,E[2]=u>>>16&255,E[3]=u>>>24&255,r.check=B(r.check,E,4,0)),l=u=0,r.mode=4;case 4:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.xflags=255&u,r.head.os=u>>8),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=5;case 5:if(1024&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length=u,r.head&&(r.head.extra_len=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0}else r.head&&(r.head.extra=null);r.mode=6;case 6:if(1024&r.flags&&(o<(d=r.length)&&(d=o),d&&(r.head&&(k=r.head.extra_len-r.length,r.head.extra||(r.head.extra=new Array(r.head.extra_len)),I.arraySet(r.head.extra,n,s,d,k)),512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,r.length-=d),r.length))break e;r.length=0,r.mode=7;case 7:if(2048&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.name+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.name=null);r.length=0,r.mode=8;case 8:if(4096&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.comment+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.comment=null);r.mode=9;case 9:if(512&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(65535&r.check)){e.msg="header crc mismatch",r.mode=30;break}l=u=0}r.head&&(r.head.hcrc=r.flags>>9&1,r.head.done=!0),e.adler=r.check=0,r.mode=12;break;case 10:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}e.adler=r.check=L(u),l=u=0,r.mode=11;case 11:if(0===r.havedict)return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,2;e.adler=r.check=1,r.mode=12;case 12:if(5===t||6===t)break e;case 13:if(r.last){u>>>=7&l,l-=7&l,r.mode=27;break}for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}switch(r.last=1&u,l-=1,3&(u>>>=1)){case 0:r.mode=14;break;case 1:if(j(r),r.mode=20,6!==t)break;u>>>=2,l-=2;break e;case 2:r.mode=17;break;case 3:e.msg="invalid block type",r.mode=30}u>>>=2,l-=2;break;case 14:for(u>>>=7&l,l-=7&l;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if((65535&u)!=(u>>>16^65535)){e.msg="invalid stored block lengths",r.mode=30;break}if(r.length=65535&u,l=u=0,r.mode=15,6===t)break e;case 15:r.mode=16;case 16:if(d=r.length){if(o<d&&(d=o),h<d&&(d=h),0===d)break e;I.arraySet(i,n,s,d,a),o-=d,s+=d,h-=d,a+=d,r.length-=d;break}r.mode=12;break;case 17:for(;l<14;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.nlen=257+(31&u),u>>>=5,l-=5,r.ndist=1+(31&u),u>>>=5,l-=5,r.ncode=4+(15&u),u>>>=4,l-=4,286<r.nlen||30<r.ndist){e.msg="too many length or distance symbols",r.mode=30;break}r.have=0,r.mode=18;case 18:for(;r.have<r.ncode;){for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.lens[A[r.have++]]=7&u,u>>>=3,l-=3}for(;r.have<19;)r.lens[A[r.have++]]=0;if(r.lencode=r.lendyn,r.lenbits=7,S={bits:r.lenbits},x=T(0,r.lens,0,19,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid code lengths set",r.mode=30;break}r.have=0,r.mode=19;case 19:for(;r.have<r.nlen+r.ndist;){for(;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(b<16)u>>>=_,l-=_,r.lens[r.have++]=b;else{if(16===b){for(z=_+2;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u>>>=_,l-=_,0===r.have){e.msg="invalid bit length repeat",r.mode=30;break}k=r.lens[r.have-1],d=3+(3&u),u>>>=2,l-=2}else if(17===b){for(z=_+3;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=3+(7&(u>>>=_)),u>>>=3,l-=3}else{for(z=_+7;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=11+(127&(u>>>=_)),u>>>=7,l-=7}if(r.have+d>r.nlen+r.ndist){e.msg="invalid bit length repeat",r.mode=30;break}for(;d--;)r.lens[r.have++]=k}}if(30===r.mode)break;if(0===r.lens[256]){e.msg="invalid code -- missing end-of-block",r.mode=30;break}if(r.lenbits=9,S={bits:r.lenbits},x=T(D,r.lens,0,r.nlen,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid literal/lengths set",r.mode=30;break}if(r.distbits=6,r.distcode=r.distdyn,S={bits:r.distbits},x=T(F,r.lens,r.nlen,r.ndist,r.distcode,0,r.work,S),r.distbits=S.bits,x){e.msg="invalid distances set",r.mode=30;break}if(r.mode=20,6===t)break e;case 20:r.mode=21;case 21:if(6<=o&&258<=h){e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,R(e,c),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,12===r.mode&&(r.back=-1);break}for(r.back=0;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(g&&0==(240&g)){for(v=_,y=g,w=b;g=(C=r.lencode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,r.length=b,0===g){r.mode=26;break}if(32&g){r.back=-1,r.mode=12;break}if(64&g){e.msg="invalid literal/length code",r.mode=30;break}r.extra=15&g,r.mode=22;case 22:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}r.was=r.length,r.mode=23;case 23:for(;g=(C=r.distcode[u&(1<<r.distbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(0==(240&g)){for(v=_,y=g,w=b;g=(C=r.distcode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,64&g){e.msg="invalid distance code",r.mode=30;break}r.offset=b,r.extra=15&g,r.mode=24;case 24:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.offset+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}if(r.offset>r.dmax){e.msg="invalid distance too far back",r.mode=30;break}r.mode=25;case 25:if(0===h)break e;if(d=c-h,r.offset>d){if((d=r.offset-d)>r.whave&&r.sane){e.msg="invalid distance too far back",r.mode=30;break}p=d>r.wnext?(d-=r.wnext,r.wsize-d):r.wnext-d,d>r.length&&(d=r.length),m=r.window}else m=i,p=a-r.offset,d=r.length;for(h<d&&(d=h),h-=d,r.length-=d;i[a++]=m[p++],--d;);0===r.length&&(r.mode=21);break;case 26:if(0===h)break e;i[a++]=r.length,h--,r.mode=21;break;case 27:if(r.wrap){for(;l<32;){if(0===o)break e;o--,u|=n[s++]<<l,l+=8}if(c-=h,e.total_out+=c,r.total+=c,c&&(e.adler=r.check=r.flags?B(r.check,i,c,a-c):O(r.check,i,c,a-c)),c=h,(r.flags?u:L(u))!==r.check){e.msg="incorrect data check",r.mode=30;break}l=u=0}r.mode=28;case 28:if(r.wrap&&r.flags){for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(4294967295&r.total)){e.msg="incorrect length check",r.mode=30;break}l=u=0}r.mode=29;case 29:x=1;break e;case 30:x=-3;break e;case 31:return-4;case 32:default:return U}return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,(r.wsize||c!==e.avail_out&&r.mode<30&&(r.mode<27||4!==t))&&Z(e,e.output,e.next_out,c-e.avail_out)?(r.mode=31,-4):(f-=e.avail_in,c-=e.avail_out,e.total_in+=f,e.total_out+=c,r.total+=c,r.wrap&&c&&(e.adler=r.check=r.flags?B(r.check,i,c,e.next_out-c):O(r.check,i,c,e.next_out-c)),e.data_type=r.bits+(r.last?64:0)+(12===r.mode?128:0)+(20===r.mode||15===r.mode?256:0),(0==f&&0===c||4===t)&&x===N&&(x=-5),x)},r.inflateEnd=function(e){if(!e||!e.state)return U;var t=e.state;return t.window&&(t.window=null),e.state=null,N},r.inflateGetHeader=function(e,t){var r;return e&&e.state?0==(2&(r=e.state).wrap)?U:((r.head=t).done=!1,N):U},r.inflateSetDictionary=function(e,t){var r,n=t.length;return e&&e.state?0!==(r=e.state).wrap&&11!==r.mode?U:11===r.mode&&O(1,t,n,0)!==r.check?-3:Z(e,t,n,n)?(r.mode=31,-4):(r.havedict=1,N):U},r.inflateInfo="pako inflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./inffast":48,"./inftrees":50}],50:[function(e,t,r){"use strict";var D=e("../utils/common"),F=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0],N=[16,16,16,16,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,16,72,78],U=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0],P=[16,16,16,16,17,17,18,18,19,19,20,20,21,21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,29,64,64];t.exports=function(e,t,r,n,i,s,a,o){var h,u,l,f,c,d,p,m,_,g=o.bits,b=0,v=0,y=0,w=0,k=0,x=0,S=0,z=0,C=0,E=0,A=null,I=0,O=new D.Buf16(16),B=new D.Buf16(16),R=null,T=0;for(b=0;b<=15;b++)O[b]=0;for(v=0;v<n;v++)O[t[r+v]]++;for(k=g,w=15;1<=w&&0===O[w];w--);if(w<k&&(k=w),0===w)return i[s++]=20971520,i[s++]=20971520,o.bits=1,0;for(y=1;y<w&&0===O[y];y++);for(k<y&&(k=y),b=z=1;b<=15;b++)if(z<<=1,(z-=O[b])<0)return-1;if(0<z&&(0===e||1!==w))return-1;for(B[1]=0,b=1;b<15;b++)B[b+1]=B[b]+O[b];for(v=0;v<n;v++)0!==t[r+v]&&(a[B[t[r+v]]++]=v);if(d=0===e?(A=R=a,19):1===e?(A=F,I-=257,R=N,T-=257,256):(A=U,R=P,-1),b=y,c=s,S=v=E=0,l=-1,f=(C=1<<(x=k))-1,1===e&&852<C||2===e&&592<C)return 1;for(;;){for(p=b-S,_=a[v]<d?(m=0,a[v]):a[v]>d?(m=R[T+a[v]],A[I+a[v]]):(m=96,0),h=1<<b-S,y=u=1<<x;i[c+(E>>S)+(u-=h)]=p<<24|m<<16|_|0,0!==u;);for(h=1<<b-1;E&h;)h>>=1;if(0!==h?(E&=h-1,E+=h):E=0,v++,0==--O[b]){if(b===w)break;b=t[r+a[v]]}if(k<b&&(E&f)!==l){for(0===S&&(S=k),c+=y,z=1<<(x=b-S);x+S<w&&!((z-=O[x+S])<=0);)x++,z<<=1;if(C+=1<<x,1===e&&852<C||2===e&&592<C)return 1;i[l=E&f]=k<<24|x<<16|c-s|0}}return 0!==E&&(i[c+E]=b-S<<24|64<<16|0),o.bits=k,0}},{"../utils/common":41}],51:[function(e,t,r){"use strict";t.exports={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"}},{}],52:[function(e,t,r){"use strict";var i=e("../utils/common"),o=0,h=1;function n(e){for(var t=e.length;0<=--t;)e[t]=0}var s=0,a=29,u=256,l=u+1+a,f=30,c=19,_=2*l+1,g=15,d=16,p=7,m=256,b=16,v=17,y=18,w=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],k=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],x=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7],S=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],z=new Array(2*(l+2));n(z);var C=new Array(2*f);n(C);var E=new Array(512);n(E);var A=new Array(256);n(A);var I=new Array(a);n(I);var O,B,R,T=new Array(f);function D(e,t,r,n,i){this.static_tree=e,this.extra_bits=t,this.extra_base=r,this.elems=n,this.max_length=i,this.has_stree=e&&e.length}function F(e,t){this.dyn_tree=e,this.max_code=0,this.stat_desc=t}function N(e){return e<256?E[e]:E[256+(e>>>7)]}function U(e,t){e.pending_buf[e.pending++]=255&t,e.pending_buf[e.pending++]=t>>>8&255}function P(e,t,r){e.bi_valid>d-r?(e.bi_buf|=t<<e.bi_valid&65535,U(e,e.bi_buf),e.bi_buf=t>>d-e.bi_valid,e.bi_valid+=r-d):(e.bi_buf|=t<<e.bi_valid&65535,e.bi_valid+=r)}function L(e,t,r){P(e,r[2*t],r[2*t+1])}function j(e,t){for(var r=0;r|=1&e,e>>>=1,r<<=1,0<--t;);return r>>>1}function Z(e,t,r){var n,i,s=new Array(g+1),a=0;for(n=1;n<=g;n++)s[n]=a=a+r[n-1]<<1;for(i=0;i<=t;i++){var o=e[2*i+1];0!==o&&(e[2*i]=j(s[o]++,o))}}function W(e){var t;for(t=0;t<l;t++)e.dyn_ltree[2*t]=0;for(t=0;t<f;t++)e.dyn_dtree[2*t]=0;for(t=0;t<c;t++)e.bl_tree[2*t]=0;e.dyn_ltree[2*m]=1,e.opt_len=e.static_len=0,e.last_lit=e.matches=0}function M(e){8<e.bi_valid?U(e,e.bi_buf):0<e.bi_valid&&(e.pending_buf[e.pending++]=e.bi_buf),e.bi_buf=0,e.bi_valid=0}function H(e,t,r,n){var i=2*t,s=2*r;return e[i]<e[s]||e[i]===e[s]&&n[t]<=n[r]}function G(e,t,r){for(var n=e.heap[r],i=r<<1;i<=e.heap_len&&(i<e.heap_len&&H(t,e.heap[i+1],e.heap[i],e.depth)&&i++,!H(t,n,e.heap[i],e.depth));)e.heap[r]=e.heap[i],r=i,i<<=1;e.heap[r]=n}function K(e,t,r){var n,i,s,a,o=0;if(0!==e.last_lit)for(;n=e.pending_buf[e.d_buf+2*o]<<8|e.pending_buf[e.d_buf+2*o+1],i=e.pending_buf[e.l_buf+o],o++,0===n?L(e,i,t):(L(e,(s=A[i])+u+1,t),0!==(a=w[s])&&P(e,i-=I[s],a),L(e,s=N(--n),r),0!==(a=k[s])&&P(e,n-=T[s],a)),o<e.last_lit;);L(e,m,t)}function Y(e,t){var r,n,i,s=t.dyn_tree,a=t.stat_desc.static_tree,o=t.stat_desc.has_stree,h=t.stat_desc.elems,u=-1;for(e.heap_len=0,e.heap_max=_,r=0;r<h;r++)0!==s[2*r]?(e.heap[++e.heap_len]=u=r,e.depth[r]=0):s[2*r+1]=0;for(;e.heap_len<2;)s[2*(i=e.heap[++e.heap_len]=u<2?++u:0)]=1,e.depth[i]=0,e.opt_len--,o&&(e.static_len-=a[2*i+1]);for(t.max_code=u,r=e.heap_len>>1;1<=r;r--)G(e,s,r);for(i=h;r=e.heap[1],e.heap[1]=e.heap[e.heap_len--],G(e,s,1),n=e.heap[1],e.heap[--e.heap_max]=r,e.heap[--e.heap_max]=n,s[2*i]=s[2*r]+s[2*n],e.depth[i]=(e.depth[r]>=e.depth[n]?e.depth[r]:e.depth[n])+1,s[2*r+1]=s[2*n+1]=i,e.heap[1]=i++,G(e,s,1),2<=e.heap_len;);e.heap[--e.heap_max]=e.heap[1],function(e,t){var r,n,i,s,a,o,h=t.dyn_tree,u=t.max_code,l=t.stat_desc.static_tree,f=t.stat_desc.has_stree,c=t.stat_desc.extra_bits,d=t.stat_desc.extra_base,p=t.stat_desc.max_length,m=0;for(s=0;s<=g;s++)e.bl_count[s]=0;for(h[2*e.heap[e.heap_max]+1]=0,r=e.heap_max+1;r<_;r++)p<(s=h[2*h[2*(n=e.heap[r])+1]+1]+1)&&(s=p,m++),h[2*n+1]=s,u<n||(e.bl_count[s]++,a=0,d<=n&&(a=c[n-d]),o=h[2*n],e.opt_len+=o*(s+a),f&&(e.static_len+=o*(l[2*n+1]+a)));if(0!==m){do{for(s=p-1;0===e.bl_count[s];)s--;e.bl_count[s]--,e.bl_count[s+1]+=2,e.bl_count[p]--,m-=2}while(0<m);for(s=p;0!==s;s--)for(n=e.bl_count[s];0!==n;)u<(i=e.heap[--r])||(h[2*i+1]!==s&&(e.opt_len+=(s-h[2*i+1])*h[2*i],h[2*i+1]=s),n--)}}(e,t),Z(s,u,e.bl_count)}function X(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),t[2*(r+1)+1]=65535,n=0;n<=r;n++)i=a,a=t[2*(n+1)+1],++o<h&&i===a||(o<u?e.bl_tree[2*i]+=o:0!==i?(i!==s&&e.bl_tree[2*i]++,e.bl_tree[2*b]++):o<=10?e.bl_tree[2*v]++:e.bl_tree[2*y]++,s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4))}function V(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),n=0;n<=r;n++)if(i=a,a=t[2*(n+1)+1],!(++o<h&&i===a)){if(o<u)for(;L(e,i,e.bl_tree),0!=--o;);else 0!==i?(i!==s&&(L(e,i,e.bl_tree),o--),L(e,b,e.bl_tree),P(e,o-3,2)):o<=10?(L(e,v,e.bl_tree),P(e,o-3,3)):(L(e,y,e.bl_tree),P(e,o-11,7));s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4)}}n(T);var q=!1;function J(e,t,r,n){P(e,(s<<1)+(n?1:0),3),function(e,t,r,n){M(e),n&&(U(e,r),U(e,~r)),i.arraySet(e.pending_buf,e.window,t,r,e.pending),e.pending+=r}(e,t,r,!0)}r._tr_init=function(e){q||(function(){var e,t,r,n,i,s=new Array(g+1);for(n=r=0;n<a-1;n++)for(I[n]=r,e=0;e<1<<w[n];e++)A[r++]=n;for(A[r-1]=n,n=i=0;n<16;n++)for(T[n]=i,e=0;e<1<<k[n];e++)E[i++]=n;for(i>>=7;n<f;n++)for(T[n]=i<<7,e=0;e<1<<k[n]-7;e++)E[256+i++]=n;for(t=0;t<=g;t++)s[t]=0;for(e=0;e<=143;)z[2*e+1]=8,e++,s[8]++;for(;e<=255;)z[2*e+1]=9,e++,s[9]++;for(;e<=279;)z[2*e+1]=7,e++,s[7]++;for(;e<=287;)z[2*e+1]=8,e++,s[8]++;for(Z(z,l+1,s),e=0;e<f;e++)C[2*e+1]=5,C[2*e]=j(e,5);O=new D(z,w,u+1,l,g),B=new D(C,k,0,f,g),R=new D(new Array(0),x,0,c,p)}(),q=!0),e.l_desc=new F(e.dyn_ltree,O),e.d_desc=new F(e.dyn_dtree,B),e.bl_desc=new F(e.bl_tree,R),e.bi_buf=0,e.bi_valid=0,W(e)},r._tr_stored_block=J,r._tr_flush_block=function(e,t,r,n){var i,s,a=0;0<e.level?(2===e.strm.data_type&&(e.strm.data_type=function(e){var t,r=4093624447;for(t=0;t<=31;t++,r>>>=1)if(1&r&&0!==e.dyn_ltree[2*t])return o;if(0!==e.dyn_ltree[18]||0!==e.dyn_ltree[20]||0!==e.dyn_ltree[26])return h;for(t=32;t<u;t++)if(0!==e.dyn_ltree[2*t])return h;return o}(e)),Y(e,e.l_desc),Y(e,e.d_desc),a=function(e){var t;for(X(e,e.dyn_ltree,e.l_desc.max_code),X(e,e.dyn_dtree,e.d_desc.max_code),Y(e,e.bl_desc),t=c-1;3<=t&&0===e.bl_tree[2*S[t]+1];t--);return e.opt_len+=3*(t+1)+5+5+4,t}(e),i=e.opt_len+3+7>>>3,(s=e.static_len+3+7>>>3)<=i&&(i=s)):i=s=r+5,r+4<=i&&-1!==t?J(e,t,r,n):4===e.strategy||s===i?(P(e,2+(n?1:0),3),K(e,z,C)):(P(e,4+(n?1:0),3),function(e,t,r,n){var i;for(P(e,t-257,5),P(e,r-1,5),P(e,n-4,4),i=0;i<n;i++)P(e,e.bl_tree[2*S[i]+1],3);V(e,e.dyn_ltree,t-1),V(e,e.dyn_dtree,r-1)}(e,e.l_desc.max_code+1,e.d_desc.max_code+1,a+1),K(e,e.dyn_ltree,e.dyn_dtree)),W(e),n&&M(e)},r._tr_tally=function(e,t,r){return e.pending_buf[e.d_buf+2*e.last_lit]=t>>>8&255,e.pending_buf[e.d_buf+2*e.last_lit+1]=255&t,e.pending_buf[e.l_buf+e.last_lit]=255&r,e.last_lit++,0===t?e.dyn_ltree[2*r]++:(e.matches++,t--,e.dyn_ltree[2*(A[r]+u+1)]++,e.dyn_dtree[2*N(t)]++),e.last_lit===e.lit_bufsize-1},r._tr_align=function(e){P(e,2,3),L(e,m,z),function(e){16===e.bi_valid?(U(e,e.bi_buf),e.bi_buf=0,e.bi_valid=0):8<=e.bi_valid&&(e.pending_buf[e.pending++]=255&e.bi_buf,e.bi_buf>>=8,e.bi_valid-=8)}(e)}},{"../utils/common":41}],53:[function(e,t,r){"use strict";t.exports=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0}},{}],54:[function(e,t,r){(function(e){!function(r,n){"use strict";if(!r.setImmediate){var i,s,t,a,o=1,h={},u=!1,l=r.document,e=Object.getPrototypeOf&&Object.getPrototypeOf(r);e=e&&e.setTimeout?e:r,i="[object process]"==={}.toString.call(r.process)?function(e){process.nextTick(function(){c(e)})}:function(){if(r.postMessage&&!r.importScripts){var e=!0,t=r.onmessage;return r.onmessage=function(){e=!1},r.postMessage("","*"),r.onmessage=t,e}}()?(a="setImmediate$"+Math.random()+"$",r.addEventListener?r.addEventListener("message",d,!1):r.attachEvent("onmessage",d),function(e){r.postMessage(a+e,"*")}):r.MessageChannel?((t=new MessageChannel).port1.onmessage=function(e){c(e.data)},function(e){t.port2.postMessage(e)}):l&&"onreadystatechange"in l.createElement("script")?(s=l.documentElement,function(e){var t=l.createElement("script");t.onreadystatechange=function(){c(e),t.onreadystatechange=null,s.removeChild(t),t=null},s.appendChild(t)}):function(e){setTimeout(c,0,e)},e.setImmediate=function(e){"function"!=typeof e&&(e=new Function(""+e));for(var t=new Array(arguments.length-1),r=0;r<t.length;r++)t[r]=arguments[r+1];var n={callback:e,args:t};return h[o]=n,i(o),o++},e.clearImmediate=f}function f(e){delete h[e]}function c(e){if(u)setTimeout(c,0,e);else{var t=h[e];if(t){u=!0;try{!function(e){var t=e.callback,r=e.args;switch(r.length){case 0:t();break;case 1:t(r[0]);break;case 2:t(r[0],r[1]);break;case 3:t(r[0],r[1],r[2]);break;default:t.apply(n,r)}}(t)}finally{f(e),u=!1}}}}function d(e){e.source===r&&"string"==typeof e.data&&0===e.data.indexOf(a)&&c(+e.data.slice(a.length))}}("undefined"==typeof self?void 0===e?this:e:self)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}]},{},[10])(10)});
    var z = window.JSZip;
    if (had) window.JSZip = prev; else try { delete window.JSZip; } catch (e) { window.JSZip = undefined; }
    return z;
  }

  function start() {
    'use strict';
    const JSZip = loadZip();
    const PBL_CSS = ".pbl { --pbl-pinked-top: polygon(0 7px, 5% 0, 10% 7px, 15% 0, 20% 7px, 25% 0, 30% 7px, 35% 0, 40% 7px, 45% 0, 50% 7px, 55% 0, 60% 7px, 65% 0, 70% 7px, 75% 0, 80% 7px, 85% 0, 90% 7px, 95% 0, 100% 7px, 100% 100%, 0 100%);\n  --pbl-pinked-bottom: polygon(0 0, 100% 0, 100% calc(100% - 7px), 97.5% 100%, 95% calc(100% - 7px), 92.5% 100%, 90% calc(100% - 7px), 87.5% 100%, 85% calc(100% - 7px), 82.5% 100%, 80% calc(100% - 7px), 77.5% 100%, 75% calc(100% - 7px), 72.5% 100%, 70% calc(100% - 7px), 67.5% 100%, 65% calc(100% - 7px), 62.5% 100%, 60% calc(100% - 7px), 57.5% 100%, 55% calc(100% - 7px), 52.5% 100%, 50% calc(100% - 7px), 47.5% 100%, 45% calc(100% - 7px), 42.5% 100%, 40% calc(100% - 7px), 37.5% 100%, 35% calc(100% - 7px), 32.5% 100%, 30% calc(100% - 7px), 27.5% 100%, 25% calc(100% - 7px), 22.5% 100%, 20% calc(100% - 7px), 17.5% 100%, 15% calc(100% - 7px), 12.5% 100%, 10% calc(100% - 7px), 7.5% 100%, 5% calc(100% - 7px), 2.5% 100%, 0 calc(100% - 7px));\n  min-width: 0; }\n.pbl .page-head { align-items: flex-end; }\n.pbl .page-head .pill { margin-bottom: 4px; }\n.pbl-sr { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }\n\n/* steps */\n.pbl-steps { list-style: none; display: flex; gap: 8px; margin: 0 0 14px; padding: 2px 2px 8px; overflow-x: auto; scrollbar-width: thin; }\n.pbl-steps li { flex: none; }\n.pbl-step { display: flex; align-items: center; gap: 9px; height: 46px; padding: 0 16px 0 7px; border-radius: 999px; border: 1.5px solid var(--rule); background: var(--paper); color: var(--ink-2); font-size: 14.5px; font-weight: 600; white-space: nowrap; cursor: pointer; }\n.pbl-step:hover:not(:disabled) { border-color: var(--carbon); color: var(--ink); }\n.pbl-step .n { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--desk-2); color: var(--ink-2); font-size: 13.5px; font-weight: 700; flex: none; }\n.pbl-step .t { line-height: 1.1; }\n.pbl-step .s { font-size: 12.5px; font-weight: 500; color: var(--ink-3); }\n.pbl-step.is-done .n { background: var(--green-soft); color: var(--green); }\n.pbl-step.is-open .s { color: var(--red); font-weight: 600; }\n.pbl-step.is-warn .s { color: var(--amber); font-weight: 600; }\n.pbl-step[aria-current=step] { border-color: var(--carbon); background: var(--carbon-tint); color: var(--carbon); }\n.pbl-step[aria-current=step] .n { background: var(--btn-bg); color: var(--btn-fg); }\n.pbl-step:disabled { opacity: .5; cursor: not-allowed; }\n@media (width >= 1024px) { .pbl-steps { flex-wrap: wrap; overflow: visible; } .pbl-step.is-done:not([aria-current]) .s { display: none; } }\n.pbl-step:focus-visible, .pbl-slot:focus-visible, .pbl-pic:focus-visible, .pbl-x:focus-visible, .pbl-slot__x:focus-visible { outline: 2.5px solid var(--focus); outline-offset: 2px; }\n\n/* panel & text */\n.pbl-panel { padding: 22px 26px 18px; min-width: 0; }\n.pbl-panel .form-sec__title { margin-bottom: 8px; }\n.pbl-panel h2:focus { outline: none; }\n.pbl-lede { color: var(--ink-2); font-size: 15px; line-height: 1.5; max-width: 66ch; margin: 0 0 18px; }\n.pbl-h3 { font-family: var(--font-display); color: var(--ink); font-size: 24px; font-weight: 500; line-height: 1; margin: 26px 0 12px; padding-top: 4px; }\n.pbl-empty { color: var(--ink-2); padding: 14px 0; margin: 0; }\n.pbl-summary { font-family: var(--font-display); font-size: 34px; font-weight: 500; line-height: 1; color: var(--ink); margin: 6px 0 16px; padding-top: 4px; max-width: 30ch; }\n.pbl-req { color: var(--red); font-weight: 700; }\n.pbl .fine { max-width: 72ch; line-height: 1.45; }\n.pbl .banner { margin: 12px 0; font-size: 14.5px; }\n.pbl-banner.is-ok { background: var(--green-soft); }\n.pbl-banner.is-info { background: var(--carbon-tint); border: 1px solid var(--rule); }\n.pbl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: 18px 24px; }\n.pbl-field.is-wide { grid-column: 1 / -1; }\n.pbl-field .check { min-height: 30px; margin-top: 4px; }\n.pbl-ta { height: auto !important; min-height: 64px; resize: vertical; line-height: 1.4 !important; }\n.pbl-inline { display: flex; align-items: center; gap: 10px; }\n.pbl-inline > span { color: var(--ink-2); white-space: nowrap; font-size: 15px; }\n.pbl-inline .pb-input { width: 84px; }\n.pbl-more { margin-top: 26px; border-top: 1px solid var(--rule-soft); padding-top: 12px; }\n.pbl-more summary { cursor: pointer; font-family: var(--font-display); font-size: 24px; font-weight: 500; color: var(--ink); padding: 6px 0 12px; }\n.pbl-more summary .fine-inline { font-family: var(--font-text); margin-left: 6px; }\n.pbl-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 14px 0 4px; }\n.pbl-actions .pb-btn, .pbl-nav .pb-btn, .pbl-filebtn { display: inline-flex; }\n.pbl-armed { background: var(--red) !important; color: #fff !important; border-color: var(--red) !important; }\n.pbl-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 26px; padding-top: 16px; border-top: 1px solid var(--rule-soft); }\n.pbl-big { height: 52px; padding: 0 26px; font-size: 16.5px; }\n.pbl .pb-btn.is-danger:hover:not(:disabled) { background: var(--red-soft); }\n\n/* template */\n.pbl-drop { align-items: center; text-align: center; width: 100%; padding: 26px 20px; }\n.pbl-drop.is-compact { flex-direction: row; justify-content: center; flex-wrap: wrap; gap: 6px 10px; padding: 14px 18px; }\n.pbl-drop.is-compact svg { margin: 0; }\n.pbl-drop:focus-within { outline: 2.5px solid var(--focus); outline-offset: 2px; }\n.pbl-drop.is-over { border-color: var(--carbon); background: var(--carbon-soft); }\n.pbl-tpl { display: flex; gap: 18px; align-items: flex-start; padding: 16px 18px; border: 1.5px solid var(--rule); border-radius: 12px; margin-bottom: 16px; background: var(--carbon-tint); }\n.pbl-tpl__sheet { flex: none; width: 54px; height: 66px; border-radius: 6px; border: 1.5px solid var(--carbon); background: var(--paper); display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 13px repeat(2, 1fr); overflow: hidden; }\n.pbl-tpl__sheet span { border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }\n.pbl-tpl__sheet span:nth-child(-n+2) { background: var(--btn-bg); border-color: var(--btn-bg); }\n.pbl-tpl__name { font-family: var(--font-display); font-size: 28px; font-weight: 500; line-height: 1; margin: 4px 0 2px; color: var(--ink); }\n.pbl-tpl__file { font-size: 13px; color: var(--ink-2); margin: 0 0 6px; word-break: break-all; }\n.pbl-facts { margin: 0; padding-left: 18px; font-size: 14.5px; color: var(--ink); list-style: disc; }\n\n/* ready-made sets */\n.pbl-presets { margin-top: 8px; padding: 4px 16px 14px; border: 1.5px solid var(--rule); border-radius: 12px; background: var(--carbon-tint); }\n.pbl-presets .pbl-h3 { margin-top: 14px; }\n.pbl-preset-list { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 10px; }\n.pbl-preset { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 12px 14px; border-radius: 10px; background: var(--paper); border: 1.5px solid var(--rule-soft); }\n.pbl-preset.is-on { border-color: var(--carbon); }\n.pbl-preset__txt { display: grid; gap: 3px; min-width: 0; flex: 1 1 260px; }\n.pbl-preset__txt b { color: var(--ink); font-size: 15.5px; }\n.pbl-preset__txt span { color: var(--ink-2); font-size: 13.5px; line-height: 1.4; }\n.pbl-preset__wait { color: var(--carbon) !important; font-weight: 600; }\n.pbl-preset__btns { display: flex; gap: 8px; flex-wrap: wrap; }\n.pbl-preset__btns .pb-btn { display: inline-flex; }\n.pbl-preset-save { margin-top: 14px; }\n.pbl-grow { flex: 1 1 220px; min-width: 0; }\n\n/* sizes */\n.pbl-chips { gap: 8px; }\n.pbl-chips .chip { height: 38px; min-width: 50px; justify-content: center; font-weight: 600; font-size: 14.5px; }\n.pbl-chart th, .pbl-chart td { vertical-align: middle; }\n.pbl-chart tbody th { font-weight: 700; color: var(--ink); font-size: 15px; padding: 6px 12px 6px 8px; }\n.pbl-chart .pb-select { min-width: 90px; }\n\n/* photos: the shade card */\n.pbl-shades { display: flex; gap: 12px; overflow-x: auto; padding: 2px 2px 14px; margin: -2px 0 14px; }\n.pbl-shade { flex: none; width: 106px; display: flex; flex-direction: column; background: var(--paper); border: 1px solid var(--rule); border-radius: 3px; padding: 0 0 8px; box-shadow: var(--shadow-sheet); }\n.pbl-shade__chip { display: block; height: 78px; margin-bottom: 7px; background: var(--sw, var(--desk-2)); clip-path: var(--pbl-pinked-top); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .08); }\n.pbl-shade__chip.is-blank, .pbl-card__swatch.is-blank { background: repeating-linear-gradient(135deg, var(--desk-2) 0 7px, var(--rule) 7px 8px); }\n.pbl-shade__name { font-weight: 600; font-size: 14.5px; line-height: 1.2; padding: 0 9px; color: var(--ink); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }\n.pbl-shade__meesho { font-size: 12.5px; color: var(--ink-2); padding: 0 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.pbl-shade__meesho.is-missing { color: var(--red); font-weight: 600; }\n.pbl-selbar { position: sticky; top: calc(64px + env(safe-area-inset-top, 0px)); z-index: 30; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: 14px 0; padding: 7px 7px 7px 16px; border-radius: 10px; background: var(--btn-bg); color: var(--btn-fg); font-size: 14.5px; box-shadow: var(--shadow-pop); }\n.pbl-selbar .pb-btn--ghost { color: var(--btn-fg); display: inline-flex; }\n.pbl-selbar .pb-btn--ghost:hover:not(:disabled) { background: rgba(255, 255, 255, .18); color: var(--btn-fg); }\n@media (width >= 1024px) { .pbl-selbar { top: 12px; } }\n.pbl-colours { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(290px, 100%), 1fr)); gap: 16px; margin-top: 16px; }\n.pbl-card { border: 1.5px solid var(--rule); border-radius: 12px; background: var(--paper); overflow: hidden; min-width: 0; }\n.pbl-card__swatch { height: 22px; background: var(--sw, var(--desk-2)); clip-path: var(--pbl-pinked-bottom); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .06); }\n.pbl-card__body { padding: 8px 14px 14px; }\n.pbl-card__head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 34px; gap: 12px; align-items: end; }\n.pbl-card__cat { margin-top: 10px; }\n.pbl-x { width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid var(--rule); background: var(--paper); color: var(--ink-3); font-size: 19px; line-height: 1; display: grid; place-items: center; cursor: pointer; }\n.pbl-x:hover { color: var(--red); border-color: var(--red); }\n.pbl-slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }\n.pbl-slot-wrap { position: relative; min-width: 0; }\n.pbl-slot { position: relative; width: 100%; aspect-ratio: 3 / 4; border: 1.5px dashed var(--rule); border-radius: 8px; background: var(--carbon-tint); display: flex; align-items: center; justify-content: center; padding: 0; overflow: hidden; cursor: pointer; color: var(--ink-3); }\n.pbl-slot.is-filled { border-style: solid; cursor: grab; background: var(--desk-2); }\n.pbl-slot img { width: 100%; height: 100%; object-fit: cover; display: block; }\n.pbl-slot__empty { font-size: 14px; font-weight: 600; }\n.pbl-slot__tag { position: absolute; left: 6px; bottom: 6px; background: rgba(20, 16, 40, .72); color: #fff; font-size: 12px; font-weight: 600; padding: 0 8px; border-radius: 999px; line-height: 20px; }\n.pbl-slot.is-target { border-color: var(--focus); border-style: dashed; color: var(--focus); }\n.pbl-slot.is-filled.is-target { border-style: solid; }\n.pbl-slot.is-selected, .pbl-pic.is-selected { outline: 3px solid var(--focus); outline-offset: 2px; }\n.pbl-slot.is-over, .pbl-tray.is-over { border-color: var(--carbon); background: var(--carbon-soft); }\n.pbl-slot.is-dragging, .pbl-pic.is-dragging { opacity: .45; }\n.pbl-slot__x { position: absolute; top: 5px; right: 5px; width: 28px; height: 28px; border-radius: 50%; border: 0; background: rgba(20, 16, 40, .7); color: #fff; font-size: 16px; line-height: 1; display: grid; place-items: center; cursor: pointer; }\n.pbl-slot__x:hover { background: var(--red); }\n.pbl-badge { position: absolute; top: 6px; left: 6px; background: var(--amber); color: #fff; font-size: 11px; font-weight: 700; padding: 0 6px; border-radius: 5px; line-height: 18px; }\n.pbl-nothumb { font-size: 12.5px; font-weight: 700; color: var(--ink-3); }\n.pbl-tray { margin-top: 20px; border: 1.5px dashed var(--rule); border-radius: 12px; padding: 12px 16px 14px; background: var(--carbon-tint); }\n.pbl-tray__head { display: flex; align-items: baseline; gap: 10px; }\n.pbl-tray__head .pbl-h3 { margin: 6px 0 0; }\n.pbl-tray__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 12px; margin-top: 8px; }\n.pbl-tphoto { min-width: 0; }\n.pbl-pic { position: relative; width: 100%; aspect-ratio: 3 / 4; border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; padding: 0; background: var(--paper); cursor: pointer; display: grid; place-items: center; }\n.pbl-pic img { width: 100%; height: 100%; object-fit: cover; }\n.pbl-nm { display: block; font-size: 12px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 3px; }\n.pbl-cats { margin-top: 28px; border-top: 1px solid var(--rule-soft); }\n.pbl-cat { display: grid; grid-template-columns: 98px minmax(0, 1fr) auto; gap: 18px; align-items: start; padding: 14px 0; border-bottom: 1px solid var(--rule-soft); }\n.pbl-cat .pbl-grid { grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); gap: 12px 18px; }\n.pbl-placement { max-width: 440px; margin-top: 14px; }\n\n/* links */\n.pbl-paste .pbl-ta { min-height: 96px; border: 1.5px solid var(--rule); border-radius: var(--r-ctl); padding: 10px 12px; background: var(--paper); }\n.pbl-paste .pbl-ta:focus { border-color: var(--carbon); }\n.pbl-links td { vertical-align: middle; }\n.pbl-links .pb-input { min-width: 230px; }\n.pbl-num { color: var(--ink-3); font-weight: 700; width: 34px; }\n.pbl-st { width: 1%; }\n.pbl-ph { display: flex; align-items: center; gap: 10px; min-width: 190px; max-width: 290px; white-space: normal; }\n.pbl-ph img, .pbl-ph .pbl-nothumb { width: 40px; height: 54px; object-fit: cover; border-radius: 5px; flex: none; background: var(--desk-2); display: grid; place-items: center; }\n.pbl-ph__name { font-weight: 600; font-size: 14px; color: var(--ink); word-break: break-all; line-height: 1.25; }\n.pbl-ph__where { font-size: 12.5px; color: var(--ink-2); }\n.pbl-open { display: inline-block; margin-top: 3px; font-size: 13px; }\n.pbl-pill-order { background: var(--yellow); color: #5c3b00; }\n\n/* download */\n.pbl-issues { list-style: none; padding: 0; margin: 10px 0; display: grid; gap: 8px; }\n.pbl-issues li { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 7px 7px 7px 14px; border-radius: 10px; font-size: 14.5px; color: var(--ink); }\n.pbl-issues li.is-error { background: var(--red-soft); }\n.pbl-issues li.is-warn { background: var(--carbon-tint); border: 1px solid var(--rule); }\n.pbl-issues li.is-more { color: var(--ink-2); }\n.pbl-issues .pb-btn { flex: none; display: inline-flex; }\n.pbl-preview { max-height: 460px; overflow: auto; border: 1px solid var(--rule-soft); border-radius: 10px; }\n.pbl-preview table { min-width: 780px; }\n.pbl-preview th { position: sticky; top: 0; background: var(--paper); z-index: 1; }\n.pbl-next { margin-top: 24px; padding: 16px 18px; border-radius: 12px; background: var(--carbon-tint); }\n.pbl-next .pb-btn { display: inline-flex; }\n\n/* toasts & busy (same look as PakkaBill's own) */\n.pbl-toasts { position: fixed; left: 50%; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 91; pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 8px; width: min(92vw, 460px); }\n@media (width >= 1024px) { .pbl-toasts { bottom: 28px; } }\n.pbl-busy { position: fixed; inset: 0; display: none; place-items: center; background: rgba(20, 16, 40, .25); z-index: 95; }\n.pbl-busy.is-on { display: grid; }\n.pbl-busy > div { background: var(--paper); color: var(--ink); border: 1px solid var(--rule); border-radius: 12px; padding: 16px 22px; font-weight: 600; display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-pop); }\n.pbl-busy > div::before { content: \"\"; width: 18px; height: 18px; border-radius: 50%; border: 2.5px solid var(--rule); border-top-color: var(--btn-bg); animation: pbl-spin .8s linear infinite; }\n@keyframes pbl-spin { to { transform: rotate(360deg); } }\n\n/* phones */\n@media (width < 1024px) {\n  .pbl-step .s { display: none; }\n  .pbl-step { height: 42px; padding: 0 14px 0 6px; }\n  .pbl-step .n { width: 28px; height: 28px; }\n}\n@media (width < 720px) {\n  .pbl-panel { padding: 16px 14px 14px; }\n  .pbl-summary { font-size: 30px; }\n  .pbl-card__head { grid-template-columns: minmax(0, 1fr) 34px; }\n  .pbl-card__head > .pb-field:nth-child(2) { grid-column: 1; grid-row: 2; }\n  .pbl-cat { grid-template-columns: 84px minmax(0, 1fr); }\n  .pbl-cat > .pbl-x { grid-column: 2; justify-self: end; }\n  .pbl-links thead { display: none; }\n  .pbl-links tr { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 6px 8px; padding: 10px 4px; border-bottom: 1px solid var(--rule-soft); }\n  .pbl-links td { border: 0; padding: 0; }\n  .pbl-links td.pbl-num { grid-row: 1 / span 3; }\n  .pbl-links .pb-input { min-width: 0; }\n  .pbl-nav .pb-btn--primary { flex: 1; }\n  .pbl-big { width: 100%; }\n}\n@media (prefers-reduced-motion: reduce) { .pbl *, .pbl-busy * { animation: none !important; transition: none !important; } }\n";

/* ======================================================= engine */

/* =========================================================================
   Core engine (no UI): template reading, photo names, links, rows, writer
   ========================================================================= */

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_XML = 'http://www.w3.org/XML/1998/namespace';

const uid = () => Math.random().toString(36).slice(2, 10);
const pad2 = n => String(n).padStart(2, '0');
const IMG_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?|avif)$/i;
const normKey = s => String(s || '').toLowerCase().replace(IMG_EXT, '').replace(/[^a-z0-9]+/g, '');
const alnum = s => String(s || '').replace(/[^A-Za-z0-9]+/g, '');
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const VIEWS = ['front', 'back', 'side'];

function colToIdx(col) { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function idxToCol(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function splitRef(ref) { const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(String(ref).toUpperCase()); return m ? { col: m[1], row: +m[2] } : null; }

function parseXml(str) {
  const doc = new DOMParser().parseFromString(str, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Part of this file is damaged. Download the template again from Meesho.');
  return doc;
}
function serializeXml(doc) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '');
}
const kids = (el, name) => { const out = []; for (const c of el.children) if (c.localName === name) out.push(c); return out; };
const kid = (el, name) => { for (const c of el.children) if (c.localName === name) return c; return null; };

function filenameFromUrl(u) {
  let s = String(u).split(/[?#]/)[0];
  s = s.substring(s.lastIndexOf('/') + 1);
  try { s = decodeURIComponent(s); } catch (e) { /* keep raw */ }
  return s;
}
function isNumericText(s) { return /^-?(0|[1-9]\d*)(\.\d+)?$/.test(String(s).trim()); }

/* ---------------------------------------------------------------- cells */

function readSharedStrings(doc) {
  const out = [];
  for (const si of doc.getElementsByTagNameNS(NS_MAIN, 'si')) {
    let s = '';
    for (const t of si.getElementsByTagNameNS(NS_MAIN, 't')) {
      if (t.parentNode && t.parentNode.localName === 'rPh') continue;
      s += t.textContent;
    }
    out.push(s);
  }
  return out;
}

function cellText(c, sst) {
  const t = c.getAttribute('t');
  if (t === 's') { const v = kid(c, 'v'); return v ? (sst[+v.textContent] || '') : ''; }
  if (t === 'inlineStr') {
    const is = kid(c, 'is'); if (!is) return '';
    let s = ''; for (const tt of is.getElementsByTagNameNS(NS_MAIN, 't')) s += tt.textContent; return s;
  }
  const v = kid(c, 'v');
  if (!v) return '';
  const raw = v.textContent;
  if ((t === null || t === 'n') && raw !== '' && !isNaN(+raw)) return String(+(+raw).toPrecision(15));
  return raw;
}

/** Visit every cell, coping with rows/cells that leave out their "r" address. */
function forEachCell(doc, fn, opts) {
  opts = opts || {};
  const sd = doc.getElementsByTagNameNS(NS_MAIN, 'sheetData')[0];
  if (!sd) return;
  let lastRow = 0;
  for (const row of kids(sd, 'row')) {
    const r = row.hasAttribute('r') ? +row.getAttribute('r') : lastRow + 1;
    lastRow = r;
    if (opts.minRow && r < opts.minRow) continue;
    if (opts.maxRow && r > opts.maxRow) break;
    let lastCol = 0;
    for (const c of kids(row, 'c')) {
      const R = c.getAttribute('r') ? splitRef(c.getAttribute('r')) : null;
      let col;
      if (R) { col = R.col; lastCol = colToIdx(col); } else { lastCol++; col = idxToCol(lastCol); }
      fn(c, col, r);
    }
  }
}

/** { 'A1': text } for non-empty cells; opts.types gets 'n' | 's' | 'b' | 'e' per cell. */
function sheetCells(doc, sst, opts) {
  opts = opts || {};
  const map = {};
  forEachCell(doc, (c, col, r) => {
    if (opts.skipFormulas && kid(c, 'f')) return;
    const txt = cellText(c, sst);
    if (txt === '') return;
    map[col + r] = txt;
    if (opts.types) {
      const t = c.getAttribute('t');
      opts.types[col + r] = (t === 's' || t === 'inlineStr' || t === 'str') ? 's' : (t === 'b' || t === 'e') ? t : 'n';
    }
  }, opts);
  return map;
}

/* ---------------------------------------------------------------- template */

function roleFor(name) {
  const n = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!n) return 'skip';
  if (n.startsWith('error')) return 'skip';
  if (n === 'product name') return 'name';
  if (n === 'variation') return 'size';
  if (n === 'meesho price') return 'price';
  if (n.includes('returns price')) return 'returns';
  if (n === 'mrp') return 'mrp';
  if (n === 'color' || n === 'colour') return 'color';
  if (/^image\s*\d/.test(n)) return 'image';
  if (n.includes('style id')) return 'style';
  if (n === 'sku id' || n === 'sku') return 'sku';
  if (n === 'group id') return 'group';
  if (/ size$/.test(n)) return 'measure';
  return 'generic';
}

/**
 * Read a Meesho category template. The returned schema drives both the form
 * and the writer, so any category keeps working as long as Meesho keeps the
 * same sheet layout (field names in row 3, data from row 5).
 */
async function loadTemplate(bytes) {
  if (typeof JSZip === 'undefined') throw new Error('The Excel engine did not load. Check your internet connection and reload the page.');
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch (e) { throw new Error('This is not an Excel (.xlsx) file.'); }
  const need = p => { const f = zip.file(p); if (!f) throw new Error('This file is not a Meesho template (missing ' + p + ').'); return f.async('string'); };
  const wb = parseXml(await need('xl/workbook.xml'));
  const rels = parseXml(await need('xl/_rels/workbook.xml.rels'));
  const relMap = {}; let sstPath = null;
  for (const r of rels.getElementsByTagNameNS(NS_PKG, 'Relationship')) {
    const target = r.getAttribute('Target') || '';
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    relMap[r.getAttribute('Id')] = path;
    if (/\/sharedStrings$/.test(r.getAttribute('Type') || '')) sstPath = path;
  }
  const sheets = [];
  for (const s of wb.getElementsByTagNameNS(NS_MAIN, 'sheet')) {
    const rid = s.getAttributeNS(NS_REL, 'id') || s.getAttribute('r:id');
    sheets.push({ name: s.getAttribute('name') || '', path: relMap[rid], state: s.getAttribute('state') || 'visible' });
  }
  const sst = sstPath && zip.file(sstPath) ? readSharedStrings(parseXml(await zip.file(sstPath).async('string'))) : [];

  const fill = sheets.find(s => /fill\s*this/i.test(s.name));
  if (!fill) throw new Error('This file has no "Fill this" sheet. Download the category template again from the Meesho supplier panel.');
  const fillDoc = parseXml(await need(fill.path));

  // ---- dropdown lists
  const definedNames = {};
  for (const dn of wb.getElementsByTagNameNS(NS_MAIN, 'definedName')) definedNames[(dn.getAttribute('name') || '').toLowerCase()] = dn.textContent;
  const cache = {};
  async function sheetData(name) {
    const key = String(name).toLowerCase();
    if (cache[key]) return cache[key];
    const s = sheets.find(x => x.name.toLowerCase() === key);
    if (!s || !s.path) return null;
    const doc = s === fill ? fillDoc : parseXml(await need(s.path));
    const types = {};
    return (cache[key] = { doc, cells: sheetCells(doc, sst, { types }), types });
  }
  async function listOptions(f1) {
    let f = String(f1 || '').trim().replace(/^=/, '');
    if (!f) return null;
    if (/^".*"$/.test(f)) {
      const opts = f.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      return { options: [...new Set(opts)], numeric: opts.length > 0 && opts.every(isNumericText) };
    }
    if (definedNames[f.toLowerCase()]) f = definedNames[f.toLowerCase()].trim().replace(/^=/, '');
    let sheetName, c1, r1, c2, r2;
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/.exec(f);
    if (m) { sheetName = m[1] ? m[1].replace(/''/g, "'") : m[2]; c1 = m[3]; r1 = +m[4]; c2 = m[5] || c1; r2 = m[6] ? +m[6] : r1; }
    else {
      const m2 = /^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/.exec(f);
      if (!m2) return null;
      sheetName = fill.name; c1 = m2[1]; r1 = +m2[2]; c2 = m2[3] || c1; r2 = m2[4] ? +m2[4] : r1;
    }
    const data = await sheetData(sheetName);
    if (!data) return null;
    const opts = []; let allNum = true;
    for (let ci = colToIdx(c1); ci <= colToIdx(c2); ci++) {
      for (let r = r1; r <= r2; r++) {
        const ref = idxToCol(ci) + r; const v = data.cells[ref];
        if (v == null || String(v).trim() === '') continue;
        opts.push(String(v).trim()); if (data.types[ref] !== 'n') allNum = false;
      }
    }
    return { options: [...new Set(opts)], numeric: opts.length > 0 && allNum };
  }

  const dvByCol = {}; const startCount = {}; let listEnd = Infinity;
  for (const dv of [...fillDoc.getElementsByTagNameNS('*', 'dataValidation')]) {
    const type = dv.getAttribute('type') || 'any';
    const f1El = kid(dv, 'formula1');
    const f1 = f1El ? f1El.textContent.trim() : '';
    let sq = dv.getAttribute('sqref') || '';
    if (!sq) { const s = kid(dv, 'sqref'); if (s) sq = s.textContent; }
    let info = null;
    if (type === 'list') { try { info = await listOptions(f1); } catch (e) { info = null; } }
    for (const part of sq.trim().split(/\s+/)) {
      const [a, b] = part.split(':'); const A = splitRef(a), B = splitRef(b || a);
      if (!A || !B) continue;
      startCount[A.row] = (startCount[A.row] || 0) + 1;
      if (type === 'list') listEnd = Math.min(listEnd, B.row);
      for (let c = colToIdx(A.col); c <= colToIdx(B.col); c++) {
        const col = idxToCol(c);
        if (dvByCol[col]) continue;
        const rule = { type, operator: dv.getAttribute('operator') || '', f1 };
        if (type === 'list') { rule.options = info && info.options.length ? info.options : null; rule.numericOptions = !!(info && info.numeric); }
        dvByCol[col] = rule;
      }
    }
  }
  let firstRow = 5;
  const starts = Object.entries(startCount).sort((a, b) => b[1] - a[1]);
  if (starts.length && +starts[0][0] >= 3) firstRow = +starts[0][0];
  const maxRows = Math.max(1, Math.min(300, (isFinite(listEnd) && listEnd >= firstRow ? listEnd : firstRow + 299) - firstRow + 1));

  // ---- header rows: group label (row 2), field name + help (row 3), notes (row 4)
  const head = sheetCells(fillDoc, sst, { maxRow: firstRow - 1 });
  const mergeOf = {};
  for (const mc of fillDoc.getElementsByTagNameNS(NS_MAIN, 'mergeCell')) {
    const [a, b] = (mc.getAttribute('ref') || '').split(':'); const A = splitRef(a), B = splitRef(b || a);
    if (!A || !B || A.row >= firstRow) continue;
    for (let r = A.row; r <= B.row; r++) for (let c = colToIdx(A.col); c <= colToIdx(B.col); c++) mergeOf[idxToCol(c) + r] = a;
  }
  const hv = ref => head[ref] != null ? head[ref] : (mergeOf[ref] && head[mergeOf[ref]] != null ? head[mergeOf[ref]] : '');

  const dim = fillDoc.getElementsByTagNameNS(NS_MAIN, 'dimension')[0];
  let lastCol = 0;
  if (dim) { const last = (dim.getAttribute('ref') || '').split(':').pop(); const R = splitRef(last); if (R) lastCol = colToIdx(R.col); }
  Object.keys(head).forEach(ref => { const R = splitRef(ref); if (R) lastCol = Math.max(lastCol, colToIdx(R.col)); });

  const columns = [];
  for (let i = 1; i <= lastCol; i++) {
    const col = idxToCol(i);
    const r2 = firstRow >= 4 ? hv(col + (firstRow - 3)) : '';
    const r3 = hv(col + (firstRow - 2)), r4 = head[col + (firstRow - 1)] || '';
    const lines = String(r3).split('\n').map(s => s.trim()).filter(Boolean);
    const name = lines[0] || '';
    const desc = lines.slice(1).join(' ');
    if (!name || /^fields/i.test(name) || /field names/i.test(r2)) continue;
    const system = /system generated/i.test(r4) || /system use/i.test(r3) || /filled by meesho/i.test(r2);
    const role = system ? 'skip' : roleFor(name);
    const rule = dvByCol[col] || null;
    let kind = 'text';
    if (rule) {
      if (rule.type === 'list' && rule.options) kind = 'list';
      else if (rule.type === 'whole') kind = 'int';
      else if (rule.type === 'decimal') kind = 'decimal';
      else if (rule.type === 'custom' && /MOD\(/i.test(rule.f1)) kind = 'price';
    }
    columns.push({
      col, idx: i, name, desc, required: /compulsory|mandatory/i.test(r2), system, role, kind,
      options: kind === 'list' ? rule.options : null, numericOptions: !!(rule && rule.numericOptions)
    });
  }
  const byRole = {};
  for (const c of columns) {
    if (c.role === 'image' || c.role === 'measure' || c.role === 'generic') (byRole[c.role] = byRole[c.role] || []).push(c);
    else if (c.role !== 'skip' && !byRole[c.role]) byRole[c.role] = c;
  }
  for (const r of ['name', 'size', 'price', 'mrp', 'color']) {
    if (!byRole[r]) throw new Error('This template has no "' + ({ name: 'Product Name', size: 'Variation', price: 'Meesho Price', mrp: 'MRP', color: 'Color' })[r] + '" column. Is it a Meesho category template?');
  }
  if (!byRole.image || !byRole.image.length) throw new Error('This template has no image columns.');
  byRole.generic = byRole.generic || []; byRole.measure = byRole.measure || [];

  // ---- how Meesho stores each field (number or text): its Example Sheet shows it best
  const exType = {};
  try {
    const ex = sheets.find(s => /example/i.test(s.name));
    const d = ex ? await sheetData(ex.name) : null;
    if (d) {
      let best = 0, bestRow = 0;
      for (let r = 1; r <= 8; r++) {
        let hit = 0;
        for (const c of columns) { const t = String(d.cells[c.col + r] || '').split('\n')[0].trim().toLowerCase(); if (t && t === c.name.toLowerCase()) hit++; }
        if (hit > best) { best = hit; bestRow = r; }
      }
      if (best >= Math.min(5, columns.length)) {
        const seen = {};
        for (const ref of Object.keys(d.cells)) {
          const Rf = splitRef(ref);
          if (!Rf || Rf.row <= bestRow || Rf.row < firstRow) continue;
          if (!d.cells[byRole.name.col + Rf.row]) continue;
          (seen[Rf.col] = seen[Rf.col] || new Set()).add(d.types[ref]);
        }
        for (const [col, set] of Object.entries(seen)) if (set.size === 1) exType[col] = [...set][0];
      }
    }
  } catch (e) { /* optional */ }
  const TEXT_ROLES = ['name', 'image', 'style', 'sku', 'group'];
  for (const c of columns) {
    if (exType[c.col] === 'n' || exType[c.col] === 's') c.store = exType[c.col];
    else if (TEXT_ROLES.includes(c.role)) c.store = 's';
    else if (['price', 'mrp', 'returns'].includes(c.role) || ['price', 'int', 'decimal'].includes(c.kind)) c.store = 'n';
    else if (c.kind === 'list') c.store = c.numericOptions ? 'n' : 's';
    else c.store = 's';
  }

  // ---- category name / id / version for the badge
  const info = { category: fill.name.replace(/[-\s]*fill\s*this/i, '').trim() || 'Category', title: head['A1'] || '', id: '', version: '' };
  try {
    const ins = sheets.find(s => /instruction/i.test(s.name));
    const d = ins ? await sheetData(ins.name) : null;
    if (d) {
      for (const [ref, v] of Object.entries(d.cells)) {
        if (v === 'BASE') {
          const R = splitRef(ref); const i = colToIdx(R.col);
          const a = d.cells[idxToCol(i - 2) + R.row], b = d.cells[idxToCol(i - 1) + R.row];
          if (isNumericText(a)) info.id = a; if (isNumericText(b)) info.version = b;
          break;
        }
      }
    }
  } catch (e) { /* optional */ }

  // ---- values Meesho already put in the rows (a "prefilled" template)
  const prefill = { details: {}, sizes: [], chart: {}, price: '', mrp: '', productName: '', rows: 0 };
  try {
    const pre = sheetCells(fillDoc, sst, { minRow: firstRow, maxRow: firstRow + maxRows - 1, skipFormulas: true });
    const byRow = {};
    for (const [ref, v] of Object.entries(pre)) { const Rf = splitRef(ref); if (Rf) (byRow[Rf.row] = byRow[Rf.row] || {})[Rf.col] = String(v).trim(); }
    const rowNums = Object.keys(byRow).map(Number).sort((a, b) => a - b);
    prefill.rows = rowNums.length;
    const common = col => {
      const cnt = {};
      for (const r of rowNums) { const v = byRow[r][col]; if (v) cnt[v] = (cnt[v] || 0) + 1; }
      let best = '', n = 0; for (const [k, c] of Object.entries(cnt)) if (c > n) { best = k; n = c; }
      return best;
    };
    for (const c of byRole.generic) { const v = common(c.col); if (v && (!c.options || c.options.includes(v))) prefill.details[c.name] = v; }
    const sOpts = byRole.size.options;
    for (const r of rowNums) {
      const s = byRow[r][byRole.size.col];
      if (!s || (sOpts && !sOpts.includes(s))) continue;
      if (!prefill.sizes.includes(s)) prefill.sizes.push(s);
      const ch = prefill.chart[s] = prefill.chart[s] || {};
      for (const m of byRole.measure) { const v = byRow[r][m.col]; if (v && !ch[m.name] && (!m.options || m.options.includes(v))) ch[m.name] = v; }
    }
    if (sOpts) prefill.sizes.sort((a, b) => sOpts.indexOf(a) - sOpts.indexOf(b));
    const p = common(byRole.price.col), mm = common(byRole.mrp.col);
    if (isNumericText(p)) prefill.price = p;
    if (isNumericText(mm)) prefill.mrp = mm;
    prefill.productName = common(byRole.name.col);
  } catch (e) { /* optional */ }

  const schema = { fillPath: fill.path, fillName: fill.name, sstPath, firstRow, maxRows, columns, byRole };
  return { bytes, info, schema, prefill };
}

/* ------------------------------------------------------ formula evaluation */
/* Just enough of Excel to store correct cached results for Meesho's own
   formulas, e.g. =IF(C5>31,C5-31,""), so the file reads right everywhere. */

const BLANK = Object.freeze({ blank: true });
const isErr = v => !!(v && typeof v === 'object' && v.err);
const XErr = code => ({ err: code });

function evalFormula(src, getRef) {
  const toks = []; let i = 0; const s = src;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      let j = i + 1, str = '';
      for (;;) { if (j >= s.length) throw new Error('bad string'); if (s[j] === '"') { if (s[j + 1] === '"') { str += '"'; j += 2; continue; } break; } str += s[j++]; }
      toks.push({ t: 'str', v: str }); i = j + 1; continue;
    }
    const two = s.substr(i, 2);
    if (two === '<=' || two === '>=' || two === '<>') { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('(),'.includes(ch)) { toks.push({ t: ch }); i++; continue; }
    if ('+-*/&=<>'.includes(ch)) { toks.push({ t: 'op', v: ch }); i++; continue; }
    const rest = s.slice(i); let m;
    if ((m = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(rest))) { toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ((m = /^\$?([A-Za-z]{1,3})\$?(\d+)(?![A-Za-z0-9_(!])/.exec(rest))) { toks.push({ t: 'ref', v: (m[1] + m[2]).toUpperCase() }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest))) {
      const w = m[0].toUpperCase(); i += m[0].length;
      if ((w === 'TRUE' || w === 'FALSE') && s[i] !== '(') toks.push({ t: 'bool', v: w === 'TRUE' });
      else toks.push({ t: 'fn', v: w.replace(/^_XLFN\./, '') });
      continue;
    }
    throw new Error('unsupported: ' + src);
  }
  let p = 0;
  const peek = () => toks[p];
  const isOp = (...ops) => peek() && peek().t === 'op' && ops.includes(peek().v);
  const expect = t => { const x = toks[p++]; if (!x || x.t !== t) throw new Error('expected ' + t); };
  function expr() { return cmp(); }
  function cmp() { let l = cat(); while (isOp('=', '<>', '<', '>', '<=', '>=')) { const op = toks[p++].v; l = { k: 'bin', op, l, r: cat() }; } return l; }
  function cat() { let l = add(); while (isOp('&')) { p++; l = { k: 'bin', op: '&', l, r: add() }; } return l; }
  function add() { let l = mul(); while (isOp('+', '-')) { const op = toks[p++].v; l = { k: 'bin', op, l, r: mul() }; } return l; }
  function mul() { let l = una(); while (isOp('*', '/')) { const op = toks[p++].v; l = { k: 'bin', op, l, r: una() }; } return l; }
  function una() { if (isOp('-', '+')) { const op = toks[p++].v; const e = una(); return op === '-' ? { k: 'neg', e } : e; } return prim(); }
  function prim() {
    const t = toks[p++];
    if (!t) throw new Error('unexpected end');
    if (t.t === 'num' || t.t === 'str' || t.t === 'bool') return { k: 'lit', v: t.v };
    if (t.t === 'ref') return { k: 'ref', v: t.v };
    if (t.t === '(') { const e = expr(); expect(')'); return e; }
    if (t.t === 'fn') {
      expect('('); const args = [];
      if (peek() && peek().t === ')') { p++; return { k: 'fn', name: t.v, args }; }
      for (;;) { args.push(expr()); const n = toks[p++]; if (!n) throw new Error('unclosed'); if (n.t === ')') break; if (n.t !== ',') throw new Error('bad args'); }
      return { k: 'fn', name: t.v, args };
    }
    throw new Error('unexpected token');
  }
  const ast = expr();
  if (p !== toks.length) throw new Error('trailing tokens');

  const num = v => { if (isErr(v)) return v; if (v === BLANK) return 0; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; const t = String(v).trim(); return t !== '' && !isNaN(+t) ? +t : XErr('#VALUE!'); };
  const str = v => v === BLANK ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? String(+v.toPrecision(15)) : String(v);
  const truthy = v => { if (isErr(v)) return v; if (v === BLANK) return false; if (typeof v === 'boolean') return v; if (typeof v === 'number') return v !== 0; const u = String(v).toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; return XErr('#VALUE!'); };
  const rank = v => typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2;
  function compare(op, a, b) {
    if (isErr(a)) return a; if (isErr(b)) return b;
    if (a === BLANK) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
    if (b === BLANK) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    let d;
    if (rank(a) !== rank(b)) d = rank(a) - rank(b);
    else if (typeof a === 'string') { const x = a.toLowerCase(), y = b.toLowerCase(); d = x < y ? -1 : x > y ? 1 : 0; }
    else d = (a > b) - (a < b);
    return { '=': d === 0, '<>': d !== 0, '<': d < 0, '>': d > 0, '<=': d <= 0, '>=': d >= 0 }[op];
  }
  function ev(n) {
    switch (n.k) {
      case 'lit': return n.v;
      case 'ref': return getRef(n.v);
      case 'neg': { const v = num(ev(n.e)); return isErr(v) ? v : -v; }
      case 'bin': {
        const a = ev(n.l), b = ev(n.r);
        if (n.op === '&') { if (isErr(a)) return a; if (isErr(b)) return b; return str(a) + str(b); }
        if ('+-*/'.includes(n.op)) {
          const x = num(a), y = num(b); if (isErr(x)) return x; if (isErr(y)) return y;
          if (n.op === '+') return x + y; if (n.op === '-') return x - y; if (n.op === '*') return x * y;
          return y === 0 ? XErr('#DIV/0!') : x / y;
        }
        return compare(n.op, a, b);
      }
      case 'fn': return fn(n.name, n.args);
    }
    throw new Error('bad node');
  }
  function fn(name, a) {
    switch (name) {
      case 'IF': { const c = truthy(ev(a[0])); if (isErr(c)) return c; if (c) return a.length > 1 ? ev(a[1]) : true; return a.length > 2 ? ev(a[2]) : false; }
      case 'IFERROR': { const v = ev(a[0]); return isErr(v) ? ev(a[1]) : v; }
      case 'AND': case 'OR': {
        let acc = name === 'AND';
        for (const x of a) { const t = truthy(ev(x)); if (isErr(t)) return t; acc = name === 'AND' ? acc && t : acc || t; }
        return acc;
      }
      case 'NOT': { const t = truthy(ev(a[0])); return isErr(t) ? t : !t; }
      case 'ISBLANK': return a[0].k === 'ref' ? getRef(a[0].v) === BLANK : false;
      case 'ISNUMBER': return typeof ev(a[0]) === 'number';
      case 'ISERROR': return isErr(ev(a[0]));
      case 'SUM': case 'MIN': case 'MAX': {
        const vals = a.map(ev).filter(v => typeof v === 'number');
        if (name === 'SUM') return vals.reduce((x, y) => x + y, 0);
        if (!vals.length) return 0; return name === 'MIN' ? Math.min(...vals) : Math.max(...vals);
      }
      case 'ABS': { const v = num(ev(a[0])); return isErr(v) ? v : Math.abs(v); }
      case 'ROUND': { const v = num(ev(a[0])), d = num(a[1] ? ev(a[1]) : 0); if (isErr(v)) return v; if (isErr(d)) return d; const f = Math.pow(10, d); return Math.round(v * f) / f; }
      case 'LEN': return str(ev(a[0])).length;
      case 'TRIM': return str(ev(a[0])).trim().replace(/\s+/g, ' ');
      case 'VALUE': return num(ev(a[0]));
      case 'CONCATENATE': case 'CONCAT': return a.map(x => str(ev(x))).join('');
    }
    throw new Error('unsupported function ' + name);
  }
  const out = ev(ast);
  return out === BLANK ? 0 : out;
}

/** Move the relative references of a shared formula to another cell. */
function shiftFormula(f, dRow, dCol) {
  let out = '', i = 0;
  while (i < f.length) {
    if (f[i] === '"') {
      let j = i + 1;
      while (j < f.length) { if (f[j] === '"') { if (f[j + 1] === '"') { j += 2; continue; } break; } j++; }
      out += f.slice(i, j + 1); i = j + 1; continue;
    }
    const prev = i > 0 ? f[i - 1] : '';
    const m = /^(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/.exec(f.slice(i));
    if (m && !/[A-Za-z0-9_.]/.test(prev)) {
      const col = m[1] ? m[2] : idxToCol(colToIdx(m[2]) + dCol);
      const row = m[3] ? m[4] : String(+m[4] + dRow);
      out += m[1] + col + m[3] + row; i += m[0].length; continue;
    }
    out += f[i]; i++;
  }
  return out;
}

/* ------------------------------------------------------- colours & names */

const COLOUR_SYNONYMS = {
  wine: 'Wine', burgundy: 'Wine', maroon: 'Maroon', darkmaroon: 'Maroon', black: 'Black', white: 'White',
  grey: 'Grey', gray: 'Grey', greymelange: 'Grey Melange', beige: 'Beige', red: 'Red', cherryred: 'Red', tomatored: 'Red', carrotred: 'Red',
  pink: 'Pink', ranipink: 'Pink', rani: 'Pink', magenta: 'Magenta', fuchsia: 'Pink', fuschia: 'Pink', hotpink: 'Pink', babypink: 'Pink',
  lightpink: 'Pink', onionpink: 'Pink', dustypink: 'Pink', rosepink: 'Pink', gajri: 'Pink', gajari: 'Pink',
  bottlegreen: 'Bottle Green', darkgreen: 'Dark Green', green: 'Green', parrotgreen: 'Green', lightgreen: 'Green', emeraldgreen: 'Green',
  mintgreen: 'Mint Green', mint: 'Mint Green', pista: 'Mint Green', pistagreen: 'Mint Green', pistachio: 'Mint Green',
  sage: 'Mint Green', sagegreen: 'Mint Green', seagreen: 'Mint Green', ramagreen: 'Teal', mehendi: 'Olive', mehndi: 'Olive',
  mehendigreen: 'Olive', mehndigreen: 'Olive', olive: 'Olive', olivegreen: 'Olive',
  blue: 'Blue', royalblue: 'Blue', powderblue: 'Blue', lightblue: 'Blue', babyblue: 'Blue', navy: 'Navy Blue', navyblue: 'Navy Blue',
  darkblue: 'Navy Blue', skyblue: 'Aqua Blue', aqua: 'Aqua Blue', aquablue: 'Aqua Blue', turquoise: 'Aqua Blue', firozi: 'Aqua Blue',
  ferozi: 'Aqua Blue', teal: 'Teal', peacockblue: 'Teal', peacockgreen: 'Teal',
  purple: 'Purple', violet: 'Purple', jamuni: 'Purple', plum: 'Purple', lavender: 'Lavender', lavendar: 'Lavender', lilac: 'Lavender', mauve: 'Lavender',
  yellow: 'Yellow', lemon: 'Lemon Yellow', lemonyellow: 'Lemon Yellow', mustard: 'Mustard', mustardyellow: 'Mustard', haldi: 'Mustard',
  gold: 'Gold', golden: 'Gold', rosegold: 'Gold', orange: 'Orange', carrot: 'Orange', peach: 'Peach', coral: 'Coral', rust: 'Rust', copper: 'Rust',
  brown: 'Brown', coffee: 'Brown', chocolate: 'Brown', chiku: 'Brown', chikoo: 'Brown', cream: 'Cream', offwhite: 'Cream', ivory: 'Cream',
  khaki: 'Khaki', nude: 'Nude', silver: 'Silver', multicolor: 'Multicolor', multicolour: 'Multicolor', multi: 'Multicolor', metallic: 'Metallic'
};
const VIEW_WORDS = { front: 'front', frontview: 'front', back: 'back', backview: 'back', rear: 'back', side: 'side', sideview: 'side', left: 'side', right: 'side', profile: 'side' };
const SET_WORDS = new Set(['set', 'collage', 'combo', 'catalog', 'catalogue', 'cover', 'group', 'mix', 'all']);

/** normalised colour word -> Meesho colour ('' when Meesho has no match). */
function colourDict(options) {
  const d = {};
  const opts = options || [];
  const lower = new Map(opts.map(o => [o.toLowerCase(), o]));
  const pick = name => {
    const l = name.toLowerCase();
    if (lower.has(l)) return lower.get(l);
    if (l === 'lavender' && lower.has('lavendar')) return lower.get('lavendar');
    const last = l.split(' ').pop();
    if (last !== l && lower.has(last)) return lower.get(last);
    return '';
  };
  for (const [k, v] of Object.entries(COLOUR_SYNONYMS)) d[k] = pick(v);
  for (const o of opts) { const k = normKey(o); if (k.length >= 3) d[k] = o; }
  return d;
}

function tokenizeName(stem) {
  const toks = [];
  stem.split(/_+/).forEach((seg, si) => {
    for (const part of seg.split(/[\s\-.,()[\]+&@#]+/)) {
      if (!part) continue;
      const pieces = part.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2').split(' ');
      for (const pc of pieces) if (pc) toks.push({ raw: pc, norm: pc.toLowerCase(), seg: si });
    }
  });
  return toks;
}
const titleCase = words => words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

/** Work out what a photo shows from its file name. */
function classifyName(filename, dict) {
  const stem = String(filename).replace(/\.[^.\/]+$/, '');
  const toks = tokenizeName(stem);
  const hits = [];
  for (let i = 0; i < toks.length;) {
    let hit = null;
    for (let len = Math.min(3, toks.length - i); len >= 1; len--) {
      const key = toks.slice(i, i + len).map(t => t.norm).join('');
      if (Object.prototype.hasOwnProperty.call(dict, key)) { hit = { key, label: titleCase(toks.slice(i, i + len).map(t => t.raw)), meesho: dict[key], seg: toks[i].seg }; i += len; break; }
    }
    if (!hit) i++; else if (!hits.some(h => h.key === hit.key)) hits.push(hit);
  }
  const views = toks.map(t => VIEW_WORDS[t.norm]).filter(Boolean);
  const setWord = toks.some(t => SET_WORDS.has(t.norm));
  let colours = hits;
  const segCount = {};
  hits.forEach(h => { segCount[h.seg] = (segCount[h.seg] || 0) + 1; });
  const best = Object.entries(segCount).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 2) colours = hits.filter(h => String(h.seg) === best[0]);
  if (colours.length >= 2 || (setWord && !views.length)) return { type: 'set', colours };
  if (colours.length === 1) return { type: 'colour', colour: colours[0], view: views[0] || null };
  return { type: 'unknown', view: views[0] || null };
}

/* ----------------------------------------------------------- size chart */

function sizeNumber(label) { const m = /^(\d+(?:\.\d+)?)/.exec(String(label).trim()); return m ? +m[1] : null; }
function nearestOption(options, target) {
  if (!options || target == null) return '';
  const want = String(target);
  if (options.includes(want)) return want;
  let best = '', bd = Infinity;
  for (const o of options) { if (!isNumericText(o)) continue; const d = Math.abs(+o - target); if (d < bd) { bd = d; best = o; } }
  return bd <= 1 ? best : '';
}
/** A typical readymade-blouse chart, only a starting point the seller checks. */
function typicalMeasure(measureName, sizeLabel, options) {
  const n = measureName.toLowerCase();
  const free = /(\d+)\s*-\s*(\d+)/.exec(sizeLabel);
  const s = sizeNumber(sizeLabel);
  if (/bust|chest/.test(n)) {
    if (free && /free/i.test(sizeLabel)) { const r = free[1] + '-' + free[2]; if (options.includes(r)) return r; }
    return s != null ? nearestOption(options, s) : '';
  }
  if (s == null || free) return '';
  if (/waist/.test(n)) return nearestOption(options, s - 4);
  if (/shoulder/.test(n)) return nearestOption(options, Math.round((13.5 + (s - 32) / 4) * 2) / 2);
  if (/length/.test(n)) return nearestOption(options, s <= 30 ? 13 : s <= 32 ? 13.5 : s <= 36 ? 14 : s <= 40 ? 14.5 : s <= 44 ? 15 : s <= 48 ? 15.5 : 16);
  return '';
}

function sizeCode(label) {
  const t = String(label);
  if (/free/i.test(t)) return 'FS' + alnum(t.replace(/free[- ]?size:?/i, ''));
  return alnum(t.replace(/alterable/i, 'A')).toUpperCase();
}

/* -------------------------------------------------------------- links */

function extractLinks(text) {
  const out = []; const re = /https?:\/\/[^\s"'<>,;|)\]]+/gi; let m;
  while ((m = re.exec(String(text)))) out.push(m[0].replace(/[.)\]]+$/, '').replace(/&amp;/g, '&'));
  return out;
}

/** Links in the order pasted, each with the line it came from. */
function parseLinkText(text) {
  const out = []; const seen = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const urls = extractLinks(line);
    for (const u of urls) { if (seen.has(u)) continue; seen.add(u); out.push({ url: u, line, many: urls.length > 1 }); }
  }
  return out;
}

/** Pair links with photos: file name inside the link first, then a file name written on the same line. */
function matchLinks(entries, photos) {
  const stems = photos.map(p => ({ key: p.key, stem: normKey(p.name) })).filter(p => p.stem);
  const taken = new Set(); const pairs = []; const unmatched = [];
  const longestUnique = list => {
    if (!list.length) return null;
    list.sort((a, b) => b.stem.length - a.stem.length);
    return list.length === 1 || list[0].stem.length > list[1].stem.length ? list[0] : null;
  };
  for (const e of entries) {
    const fk = normKey(filenameFromUrl(e.url));
    let m = stems.find(p => p.stem === fk && !taken.has(p.key)) || null, how = 'name';
    if (!m && fk.length >= 5) {
      m = longestUnique(stems.filter(p => !taken.has(p.key) && p.stem.length >= 4 && (fk.startsWith(p.stem) || fk.endsWith(p.stem) || p.stem.startsWith(fk) || p.stem.endsWith(fk))));
    }
    if (!m && !e.many) {
      const rest = normKey(e.line.split(e.url).join(' '));
      if (rest) { m = longestUnique(stems.filter(p => !taken.has(p.key) && p.stem.length >= 3 && rest.includes(p.stem))); how = 'line'; }
    }
    if (m) { taken.add(m.key); pairs.push({ key: m.key, url: e.url, how }); } else unmatched.push(e.url);
  }
  return { pairs, unmatched };
}

/** Turn a links spreadsheet into tab-separated text lines. */
async function xlsxToText(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const sstFile = zip.file('xl/sharedStrings.xml');
  const sst = sstFile ? readSharedStrings(parseXml(await sstFile.async('string'))) : [];
  const lines = [];
  const names = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort(natural);
  for (const n of names) {
    const cells = sheetCells(parseXml(await zip.file(n).async('string')), sst);
    const rows = {};
    for (const [ref, v] of Object.entries(cells)) { const R = splitRef(ref); if (R) (rows[R.row] = rows[R.row] || []).push([colToIdx(R.col), v]); }
    for (const r of Object.keys(rows).map(Number).sort((a, b) => a - b)) lines.push(rows[r].sort((a, b) => a[0] - b[0]).map(x => x[1]).join('\t'));
  }
  return lines.join('\n');
}

/* -------------------------------------------------------- building rows */

/**
 * Turn the saved details + this batch's photos into sheet rows.
 * S = settings (details, prices, sizes, chart), W = work (images, colours, catalogues).
 * Returns { parts: [{ rows, groups, cats }], issues: [{ level, msg, where }], counts, returnsLess }.
 */
function buildPlan(tpl, S, W) {
  const sch = tpl.schema, R = sch.byRole;
  const issues = [];
  const err = (msg, where) => issues.push({ level: 'error', msg, where });
  const warn = (msg, where) => issues.push({ level: 'warn', msg, where });
  const reg = W.images || {};

  // ---- details that repeat on every row
  const details = {};
  const gen = R.generic || [];
  const country = gen.find(c => /country of origin/i.test(c.name));
  const isIndia = !!country && String(S.details[country.name] || '').trim().toLowerCase() === 'india';
  for (const c of gen) {
    let v = S.details[c.name];
    v = v == null ? '' : String(v).trim();
    if (/^importer/i.test(c.name) && isIndia) v = importerValue(c);
    if (/^packer/i.test(c.name) && S.packerSame) {
      const twin = gen.find(x => x.name.toLowerCase() === c.name.toLowerCase().replace('packer', 'manufacturer'));
      if (twin) v = String(S.details[twin.name] || '').trim();
    }
    if (c.kind === 'list' && v && c.options && !c.options.includes(v)) {
      err('"' + v + '" is not one of Meesho\'s choices for ' + c.name + '. Pick it again from the list.', 'details');
      details[c.col] = ''; continue;
    }
    if (c.kind === 'int' && v && !/^\d+$/.test(v)) err(c.name + ' must be a whole number.', 'details');
    if ((c.kind === 'decimal' || c.kind === 'price') && v && !isNumericText(v)) err(c.name + ' must be a number.', 'details');
    if (c.required && !v) err(c.name + ' is empty.', 'details');
    details[c.col] = v;
  }

  // ---- pricing
  const price = +S.price, mrp = +S.mrp;
  const less = S.returnsLess === '' || S.returnsLess == null ? 31 : +S.returnsLess;
  const checkPrice = (p, m, where, label) => {
    if (!(p > 0)) err('Meesho price is missing' + label + '.', where);
    if (!(m > 0)) err('MRP is missing' + label + '.', where);
    if (p > 0 && m > 0 && p > m) err('Meesho price can\'t be more than MRP' + label + '.', where);
    if (p > 0 && Math.abs(Math.round(p * 100) - p * 100) > 1e-6) err('Meesho price can have at most 2 decimals' + label + '.', where);
    if (R.returns && p > 0 && p - less <= 0) err('The returns price would be ₹0 or less' + label + '. Lower the ₹' + less + ' difference or raise the price.', where);
  };
  if (R.returns && !(less > 0)) err('The returns price must be at least ₹1 below the Meesho price.', 'details');
  if (!String(S.productName || '').trim()) err('Product name is empty.', 'details');

  // ---- sizes
  const sizeCol = R.size;
  const sizes = (S.sizes || []).filter(s => !sizeCol.options || sizeCol.options.includes(s));
  if (!sizes.length) err('Choose at least one size.', 'sizes');
  for (const m of R.measure || []) {
    for (const s of sizes) {
      const v = (S.chart[s] || {})[m.name];
      if (m.required && !v) err(m.name + ' for size ' + s + ' is empty.', 'sizes');
      if (v && m.options && !m.options.includes(String(v))) err(m.name + ' "' + v + '" for size ' + s + ' is not one of Meesho\'s choices.', 'sizes');
    }
  }
  if (sizes.length && S.chartTypical && !S.chartChecked && (R.measure || []).length) warn('The size chart still has typical measurements. Check them against your own chart.', 'sizes');

  // ---- catalogues and colours
  const colours = W.colours || [];
  const catsIn = W.catalogues && W.catalogues.length ? W.catalogues : [{ id: 'c1', name: '' }];
  const catIds = new Set(catsIn.map(c => c.id));
  const catOf = col => catIds.has(col.cat) ? col.cat : catsIn[0].id;
  const cats = catsIn.map(c => ({ ...c, list: colours.filter(col => catOf(col) === c.id) }));
  if (!colours.length) err('Add photos to make at least one colour.', 'photos');

  const imgCols = R.image || [];
  const colourOpts = R.color.options;
  const nameBase = String(S.productName || '').trim();
  const missingLink = new Set(); const used = new Set(); const codes = new Set(); const products = [];
  cats.forEach((cat, ci) => {
    const catRef = cat.name ? 'catalogue ' + cat.name : (cats.length > 1 ? 'catalogue ' + (ci + 1) : 'the catalogue');
    const catLabel = catRef.charAt(0).toUpperCase() + catRef.slice(1);
    if (!cat.list.length) { if (cats.length > 1) warn(catLabel + ' has no colours, so it is left out.', 'photos'); return; }
    const p = cat.price !== '' && cat.price != null ? +cat.price : price;
    const m = cat.mrp !== '' && cat.mrp != null ? +cat.mrp : mrp;
    const own = cat.price || cat.mrp;
    checkPrice(p, m, own ? 'photos' : 'details', own ? ' for ' + catRef : '');
    let code = alnum(cat.name).toUpperCase().slice(0, 10) || 'C' + pad2(ci + 1);
    while (codes.has(code)) code = code + (ci + 1);
    codes.add(code);
    const seenMeesho = {};
    for (const col of cat.list) {
      const cname = col.label || 'a colour';
      if (!String(col.label || '').trim()) err('A colour in ' + catRef + ' has no name.', 'photos');
      if (!col.meesho) err('Choose the Meesho colour for ' + cname + '.', 'photos');
      else if (colourOpts && !colourOpts.includes(col.meesho)) err('"' + col.meesho + '" is not in Meesho\'s colour list. Choose the colour for ' + cname + ' again.', 'photos');
      else if (seenMeesho[col.meesho]) warn(cname + ' and ' + seenMeesho[col.meesho] + ' are both "' + col.meesho + '" in Meesho\'s colour list.', 'photos');
      else seenMeesho[col.meesho] = cname;
      const ownImgs = VIEWS.map(k => col[k]).filter(k => k && reg[k]);
      let imgs = ownImgs;
      if (cat.cover && reg[cat.cover] && S.placement !== 'none') imgs = S.placement === 'first' ? [cat.cover, ...ownImgs] : [...ownImgs, cat.cover];
      imgs = [...new Set(imgs)];
      if (imgs.length > imgCols.length) {
        warn(cname + ': Meesho takes ' + imgCols.length + ' photos, so the last one is left out.', 'photos');
        imgs = imgs.slice(0, imgCols.length);
      }
      if (!ownImgs.length) { err(cname + ' has no photo.', 'photos'); continue; }
      if (!col.front) warn(cname + ' has no front photo, so Image 1 will be its ' + (col.back ? 'back' : 'side') + ' photo.', 'photos');
      imgs.forEach(k => { used.add(k); if (!reg[k].link) missingLink.add(k); });
      const nm = String(cat.productName || '').trim() || nameBase;
      const fullName = nm && S.addColour && col.label ? nm + ' - ' + String(col.label).trim() : nm;
      products.push({ ci, cat, catLabel, code, colour: col, name: fullName, price: p, mrp: m, imgs });
    }
  });
  if (missingLink.size) err(missingLink.size + (missingLink.size > 1 ? ' photos still need their' : ' photo still needs its') + ' Meesho link.', 'links');
  for (const k of used) {
    const im = reg[k];
    if (!im) continue;
    if (im.format && im.format !== 'jpeg') warn(im.name + ' is a ' + im.format.toUpperCase() + ' file. Meesho asks for JPEG photos.', 'photos');
    if (im.cmyk) warn(im.name + ' is saved in CMYK colours. Meesho asks for RGB photos.', 'photos');
    if (im.link && /drive\.google|docs\.google/i.test(im.link)) err('The link for ' + im.name + ' is a Google Drive link. Meesho rejects those; use the Images Bulk Upload link.', 'links');
    else if (im.link && !/^https?:\/\/\S+$/i.test(im.link)) err('The link for ' + im.name + ' is not a web link.', 'links');
  }

  // ---- rows, split into files Meesho accepts
  const prefix = alnum(S.skuPrefix).toUpperCase();
  const perCat = {};
  for (const pr of products) (perCat[pr.ci] = perCat[pr.ci] || []).push(pr);
  const parts = []; let cur = null;
  const skuSeen = new Set();
  const catOrder = Object.keys(perCat).map(Number).sort((a, b) => a - b);
  for (const ci of catOrder) {
    const list = perCat[ci];
    const rowsNeeded = list.length * sizes.length;
    if (!rowsNeeded) continue;
    if (rowsNeeded > sch.maxRows) { err(list[0].catLabel + ' needs ' + rowsNeeded + ' rows but one sheet holds ' + sch.maxRows + '. Split its colours into two catalogues.', 'photos'); continue; }
    if (!cur || cur.rows.length + rowsNeeded > sch.maxRows || cur.groups >= 30) { cur = { rows: [], groups: 0, cats: [] }; parts.push(cur); }
    cur.groups++;
    const group = 'Group ' + pad2(cur.groups);
    cur.cats.push(list[0].catLabel);
    for (const pr of list) {
      const style = [prefix, pr.code, alnum(pr.colour.label).toUpperCase().slice(0, 14)].filter(Boolean).join('-');
      for (const size of sizes) {
        const v = {};
        Object.assign(v, details);
        v[R.name.col] = pr.name;
        v[R.size.col] = size;
        v[R.price.col] = pr.price;
        v[R.mrp.col] = pr.mrp;
        v[R.color.col] = pr.colour.meesho;
        for (const mc of R.measure || []) v[mc.col] = (S.chart[size] || {})[mc.name] || '';
        imgCols.forEach((c, i) => { v[c.col] = pr.imgs[i] ? (reg[pr.imgs[i]].link || '') : ''; });
        if (R.group) v[R.group.col] = group;
        if (R.style) v[R.style.col] = style;
        const sku = style + '-' + sizeCode(size);
        if (R.sku) { if (skuSeen.has(sku)) err('Two rows would get the same SKU ' + sku + '. Give the colours different names.', 'photos'); skuSeen.add(sku); v[R.sku.col] = sku; }
        for (const c of gen) if (typeof v[c.col] === 'string' && /\{(colou?r|catalogu?e)\}/i.test(v[c.col])) v[c.col] = v[c.col].replace(/\{colou?r\}/gi, pr.colour.label).replace(/\{catalogu?e\}/gi, pr.cat.name || pr.code);
        cur.rows.push({ values: v, meta: { group, catLabel: pr.catLabel, colour: pr.colour.label, meesho: pr.colour.meesho, size, name: pr.name, price: pr.price, mrp: pr.mrp, photos: pr.imgs.length, sku } });
      }
    }
  }
  const rowCount = parts.reduce((a, p) => a + p.rows.length, 0);
  return { parts, issues, returnsLess: less, counts: { catalogues: catOrder.length, products: products.length, sizes: sizes.length, rows: rowCount, missingLinks: missingLink.size, usedImages: used.size } };
}

function importerValue(c) {
  if (c.options) { const o = c.options.find(x => /not\s*required|not\s*applicable|^n\/?a$/i.test(x)); if (o) return o; }
  return 'Not Required';
}

/* -------------------------------------------------------- Excel writer */

/**
 * Write rows into a copy of the seller's own template. Everything else in the
 * file (instructions, dropdowns, hidden sheets, formulas) is left as Meesho made it.
 */
async function writeWorkbook(tpl, rows, opts) {
  opts = opts || {};
  const sch = tpl.schema;
  const zip = await JSZip.loadAsync(tpl.bytes);
  const doc = parseXml(await zip.file(sch.fillPath).async('string'));
  const sheetData = doc.getElementsByTagNameNS(NS_MAIN, 'sheetData')[0];
  const make = (name, text) => { const e = doc.createElementNS(NS_MAIN, name); if (text != null) e.textContent = text; return e; };
  const colInfo = Object.fromEntries(sch.columns.map(c => [c.col, c]));
  const dataCols = sch.columns.filter(c => c.role !== 'skip' || /^error/i.test(c.name));

  // shared strings: text goes into Meesho's own string table, as Excel itself does
  let sDoc = null, sRoot = null, sRefs = 0; const sIndex = new Map(); const sTexts = [];
  if (sch.sstPath && zip.file(sch.sstPath)) {
    sDoc = parseXml(await zip.file(sch.sstPath).async('string')); sRoot = sDoc.documentElement;
    for (const si of kids(sRoot, 'si')) {
      let s = '';
      for (const t of si.getElementsByTagNameNS(NS_MAIN, 't')) { if (t.parentNode && t.parentNode.localName === 'rPh') continue; s += t.textContent; }
      if (!kid(si, 'r') && !sIndex.has(s)) sIndex.set(s, sTexts.length);
      sTexts.push(s);
    }
  }
  const sstId = text => {
    if (sIndex.has(text)) return sIndex.get(text);
    const si = sDoc.createElementNS(NS_MAIN, 'si'); const t = sDoc.createElementNS(NS_MAIN, 't');
    t.textContent = text; if (/^\s|\s$|\n/.test(text)) t.setAttributeNS(NS_XML, 'xml:space', 'preserve');
    si.appendChild(t); sRoot.appendChild(si);
    const id = sTexts.length; sTexts.push(text); sIndex.set(text, id); return id;
  };

  const rowEls = new Map();
  for (const r of kids(sheetData, 'row')) rowEls.set(+r.getAttribute('r'), r);
  const firstRow = sch.firstRow;
  const lastTemplateRow = Math.max(firstRow, ...rowEls.keys());

  const hasFormula = c => !!kid(c, 'f');
  const hasValue = c => !!(kid(c, 'v') || kid(c, 'is'));
  // plain input style per column, taken from an untouched data row (Meesho colours its prefilled cells)
  const styleOf = {};
  let plainRow = null;
  for (const r of [...rowEls.keys()].sort((a, b) => a - b)) {
    if (r < firstRow) continue;
    const el = rowEls.get(r);
    if (!kids(el, 'c').some(c => !hasFormula(c) && hasValue(c))) { plainRow = el; break; }
  }
  const styleRow = plainRow || rowEls.get(firstRow);
  if (styleRow) for (const c of kids(styleRow, 'c')) { const R = splitRef(c.getAttribute('r')); if (R && c.getAttribute('s') != null) styleOf[R.col] = c.getAttribute('s'); }
  const styleCount = {};
  Object.values(styleOf).forEach(s => { styleCount[s] = (styleCount[s] || 0) + 1; });
  const inputStyle = Object.entries(styleCount).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || null;

  // shared formulas: remember each master so follower cells can be evaluated
  const masters = {};
  for (const f of doc.getElementsByTagNameNS(NS_MAIN, 'f')) {
    if (f.getAttribute('t') === 'shared' && f.textContent && f.getAttribute('si') != null) {
      const R = splitRef(f.parentNode.getAttribute('r'));
      if (R) masters[f.getAttribute('si')] = { text: f.textContent, row: R.row, col: colToIdx(R.col) };
    }
  }
  const effFormula = (f, R) => {
    if (f.textContent) return f.textContent;
    if (f.getAttribute('t') === 'shared') { const m = masters[f.getAttribute('si')]; if (m) return shiftFormula(m.text, R.row - m.row, colToIdx(R.col) - m.col); }
    return '';
  };

  // returns price: keep Meesho's formula, only changing its ₹31 when the seller chose another difference
  const retCol = sch.byRole.returns ? sch.byRole.returns.col : null;
  const less = opts.returnsLess == null ? 31 : +opts.returnsLess;
  let retMode = 'keep'; // 'keep' Meesho's formula, or write plain 'numbers'
  if (retCol && less !== 31) {
    const priceCol = sch.byRole.price.col;
    const THIRTY_ONE = /(^|[^0-9.A-Za-z$])31(?![0-9.])/g;
    const fs = [...doc.getElementsByTagNameNS(NS_MAIN, 'f')].filter(f => { const R = splitRef(f.parentNode.getAttribute('r')); return R && R.col === retCol && f.textContent; });
    if (fs.length && fs.every(f => new RegExp('\\$?' + priceCol + '\\$?\\d+').test(f.textContent) && new RegExp(THIRTY_ONE.source).test(f.textContent))) {
      for (const f of fs) f.textContent = f.textContent.replace(THIRTY_ONE, '$1' + less);
      for (const m of Object.values(masters)) if (m.col === colToIdx(retCol)) m.text = m.text.replace(THIRTY_ONE, '$1' + less);
    } else retMode = 'numbers';
  }
  if (retMode === 'numbers') {
    // our rows lose their formula, so first give every cell in the column its own copy:
    // a shared formula's master may sit in one of our rows, and the rows below depend on it
    for (const f of [...doc.getElementsByTagNameNS(NS_MAIN, 'f')]) {
      if (f.getAttribute('t') !== 'shared') continue;
      const R = splitRef(f.parentNode.getAttribute('r'));
      if (!R || R.col !== retCol) continue;
      const text = effFormula(f, R);
      if (!text) continue;
      f.textContent = text; f.removeAttribute('t'); f.removeAttribute('ref'); f.removeAttribute('si');
    }
  }

  function rowEl(r) {
    let el = rowEls.get(r);
    if (el) return el;
    el = make('row'); el.setAttribute('r', String(r));
    let before = null;
    for (const [k, e] of rowEls) if (k > r && (!before || k < +before.getAttribute('r'))) before = e;
    sheetData.insertBefore(el, before);
    rowEls.set(r, el);
    return el;
  }
  function cellMap(row) { const m = new Map(); for (const c of kids(row, 'c')) { const R = splitRef(c.getAttribute('r')); if (R) m.set(R.col, c); } return m; }
  function ensureCell(row, map, col, r) {
    let c = map.get(col);
    if (c) return c;
    c = make('c'); c.setAttribute('r', col + r);
    const st = styleOf[col] || inputStyle; if (st) c.setAttribute('s', st);
    const idx = colToIdx(col); let before = null;
    for (const e of kids(row, 'c')) { const R = splitRef(e.getAttribute('r')); if (R && colToIdx(R.col) > idx) { before = e; break; } }
    row.insertBefore(c, before);
    map.set(col, c);
    return c;
  }
  const clearValue = c => { for (const ch of [...c.childNodes]) c.removeChild(ch); c.removeAttribute('t'); };
  function setText(c, text) {
    clearValue(c);
    if (sDoc) { c.setAttribute('t', 's'); c.appendChild(make('v', String(sstId(text)))); sRefs++; return; }
    c.setAttribute('t', 'inlineStr');
    const is = make('is'); const t = make('t', text);
    if (/^\s|\s$|\n/.test(text)) t.setAttributeNS(NS_XML, 'xml:space', 'preserve');
    is.appendChild(t); c.appendChild(is);
  }
  function setNumber(c, n) { clearValue(c); c.appendChild(make('v', String(+(+n).toPrecision(15)))); }
  function setCached(c, val) {
    const f = kid(c, 'f');
    for (const ch of [...c.childNodes]) if (ch !== f) c.removeChild(ch);
    c.removeAttribute('t');
    if (typeof val === 'number') c.appendChild(make('v', String(+val.toPrecision(15))));
    else if (typeof val === 'boolean') { c.setAttribute('t', 'b'); c.appendChild(make('v', val ? '1' : '0')); }
    else if (isErr(val)) { c.setAttribute('t', 'e'); c.appendChild(make('v', val.err)); }
    else { c.setAttribute('t', 'str'); c.appendChild(make('v', String(val))); }
  }
  function refreshFormulas(row, map, r) {
    const memo = {}, busy = {};
    const getRef = ref => {
      const R = splitRef(ref); if (!R || R.row !== r) throw new Error('cross-row');
      if (R.col in memo) return memo[R.col];
      const c = map.get(R.col);
      if (!c) return BLANK;
      const f = kid(c, 'f');
      if (f) {
        const text = effFormula(f, { row: r, col: R.col });
        if (!text) throw new Error('unknown formula');
        if (busy[R.col]) throw new Error('cycle');
        busy[R.col] = true;
        const v = evalFormula(text, getRef);
        busy[R.col] = false;
        return (memo[R.col] = v);
      }
      if (c.getAttribute('t') === 'inlineStr') { const t = cellText(c, []); return (memo[R.col] = t === '' ? BLANK : t); }
      const v = kid(c, 'v');
      if (!v) return (memo[R.col] = BLANK);
      const t = c.getAttribute('t');
      if (t === 's') return (memo[R.col] = sTexts[+v.textContent] != null ? sTexts[+v.textContent] : '');
      if (t === 'str') return (memo[R.col] = v.textContent);
      if (t === 'b') return (memo[R.col] = v.textContent === '1');
      if (t === 'e') return (memo[R.col] = XErr(v.textContent));
      return (memo[R.col] = +v.textContent);
    };
    let ok = true;
    for (const [col, c] of map) {
      if (!kid(c, 'f')) continue;
      try { setCached(c, getRef(col + r)); } catch (e) { ok = false; }
    }
    return ok;
  }

  let allOk = true;
  const lastRow = firstRow + rows.length - 1;
  rows.forEach((row, i) => {
    const r = firstRow + i;
    const el = rowEl(r); const map = cellMap(el);
    for (const c of dataCols) {
      const cell = ensureCell(el, map, c.col, r);
      const has = Object.prototype.hasOwnProperty.call(row.values, c.col);
      const val = has ? row.values[c.col] : '';
      const st = styleOf[c.col] || inputStyle;
      if (c.col === retCol) {
        if (hasFormula(cell) && retMode === 'keep') continue;
        const p = +row.values[sch.byRole.price.col];
        clearValue(cell);
        if (st && cell.getAttribute('s') !== st) cell.setAttribute('s', st);
        if (p - less > 0) setNumber(cell, +(p - less).toFixed(2));
        continue;
      }
      if (hasFormula(cell)) continue;
      if (st && cell.getAttribute('s') !== st) cell.setAttribute('s', st);
      if (val === '' || val == null) { if (hasValue(cell)) clearValue(cell); continue; }
      const store = colInfo[c.col] ? colInfo[c.col].store : 's';
      if (typeof val === 'number') setNumber(cell, val);
      else if (store === 'n' && isNumericText(val)) setNumber(cell, +val);
      else setText(cell, String(val));
    }
    allOk = refreshFormulas(el, map, r) && allOk;
  });
  // clear anything left below our rows (Meesho's prefilled rows, earlier drafts)
  for (let r = lastRow + 1; r <= lastTemplateRow; r++) {
    const el = rowEls.get(r); if (!el) continue;
    const map = cellMap(el); let dirty = false;
    for (const [col, c] of map) {
      if (hasFormula(c) || !hasValue(c)) continue;
      clearValue(c); dirty = true;
      const st = styleOf[col] || inputStyle; if (st) c.setAttribute('s', st);
    }
    if (dirty) allOk = refreshFormulas(el, map, r) && allOk;
  }

  zip.file(sch.fillPath, serializeXml(doc));
  if (sDoc) {
    sRoot.setAttribute('uniqueCount', String(sTexts.length));
    sRoot.setAttribute('count', String(Math.max(sTexts.length, +(sRoot.getAttribute('count') || 0) + sRefs)));
    zip.file(sch.sstPath, serializeXml(sDoc));
  }
  if (retMode === 'numbers') await dropCalcChain(zip);
  // ask Excel to recalculate on open as a safety net
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  if (/<calcPr\b/.test(wbXml) && !/fullCalcOnLoad=/.test(wbXml)) zip.file('xl/workbook.xml', wbXml.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"'));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { blob, formulasOk: allOk };
}

/** Excel rebuilds the calculation chain itself; a stale one makes it complain. */
async function dropCalcChain(zip) {
  if (!zip.file('xl/calcChain.xml')) return;
  zip.remove('xl/calcChain.xml');
  const ct = await zip.file('[Content_Types].xml').async('string');
  zip.file('[Content_Types].xml', ct.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''));
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ''));
}

/* ======================================================= interface */
/* ---------------------------------------------------------------- setup */

const STEPS = [
  { id: 'template', title: 'Template' },
  { id: 'details', title: 'Details' },
  { id: 'sizes', title: 'Sizes' },
  { id: 'photos', title: 'Photos' },
  { id: 'links', title: 'Image links' },
  { id: 'download', title: 'Download' }
];
const STEP_TITLE = Object.fromEntries(STEPS.map(s => [s.id, s.title]));
const VIEW_LABEL = { front: 'Front', back: 'Back', side: 'Side' };
const LS_KEY = 'pb-listing';
const IDB_NAME = 'pakkabill-listing';
const MULTI = 'conic-gradient(from 20deg, #cf1673, #f2c611, #2d8a3e, #2a5bd6, #6b2d90, #cf1673)';
const SWATCH = {
  black: '#1d1d1f', white: '#ffffff', offwhite: '#f3eee2', cream: '#efe3c4', ivory: '#f5eed8', beige: '#d8c3a0', nude: '#e0b89c', khaki: '#b5a268',
  grey: '#8b9196', gray: '#8b9196', greymelange: '#a4a9ad', silver: '#c5c9cd', metallic: '#a8a9ad',
  red: '#c8262c', maroon: '#6c1a26', wine: '#5b1631', burgundy: '#5b1631', rust: '#a4461f', copper: '#b1643b', coral: '#ef775f', peach: '#f5b391',
  orange: '#ec7a1c', mustard: '#d2a01a', yellow: '#f2c611', lemonyellow: '#f4e04d', lemon: '#f4e04d', gold: '#c9a23c', golden: '#c9a23c',
  pink: '#e5608e', ranipink: '#cf1673', rani: '#cf1673', babypink: '#f3b5c7', hotpink: '#e3337f', magenta: '#bf1b78', fuchsia: '#c3187a', onionpink: '#e9a7b0', gajri: '#f07b8e',
  green: '#2d8a3e', darkgreen: '#1e4f2f', bottlegreen: '#0d4a34', parrotgreen: '#4caf28', olive: '#6a7a2b', mehendi: '#6a7a2b', mehndi: '#6a7a2b',
  mintgreen: '#a2dcc0', mint: '#a2dcc0', pista: '#b9d98c', teal: '#107a7b', ramagreen: '#1b7f7a',
  aquablue: '#4bc2d8', skyblue: '#7cc4ea', firozi: '#3fc0c6', blue: '#2a5bd6', royalblue: '#2748b5', navyblue: '#1c2a56', navy: '#1c2a56',
  purple: '#6b2d90', violet: '#6b2d90', lavender: '#b8a2da', lavendar: '#b8a2da', lilac: '#c7a6d8',
  brown: '#6e492e', coffee: '#5a3b26', chocolate: '#4a2b1b', multicolor: MULTI, multicolour: MULTI
};
const SVG = {
  chev: '<svg class="pb-select__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  up: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>',
  photos: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
  dl: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>'
};

const defaultSettings = () => ({ details: {}, packerSame: true, price: '', mrp: '', returnsLess: 31, sizes: [], chart: {}, chartTypical: false, chartChecked: false, productName: '', addColour: true, skuPrefix: '', placement: 'last' });
const newCatalogue = () => ({ id: 'c' + uid(), name: '', cover: '', price: '', mrp: '', productName: '' });
const defaultWork = () => ({ images: {}, colours: [], catalogues: [newCatalogue()], pendingLinks: [] });

const state = { tpl: null, S: defaultSettings(), W: defaultWork(), step: 'template', selected: null, linkNote: null, downloaded: false, openOptional: false, shopNote: false, loaded: null };
const els = { root: null, steps: null, panel: null, pill: null, toasts: null, busy: null };

/* ------------------------------------------------------------- helpers */

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv); }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function svgEl(markup) { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild; }
const plural = (n, w, pl) => n + ' ' + (n === 1 ? w : (pl || w + 's'));
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('en-IN');
function btn(label, onClick, kind, attrs) {
  return h('button', Object.assign({ type: 'button', class: 'pb-btn ' + (kind || 'pb-btn--secondary'), onclick: onClick }, attrs || {}), label);
}
function banner(level, ...content) { return h('div', { class: 'banner' + (level === 'warn' ? ' banner--warn' : '') + ' pbl-banner is-' + level, role: level === 'error' ? 'alert' : null }, ...content); }
const input = attrs => h('input', Object.assign({ class: 'pb-input' }, attrs));
const textarea = attrs => h('textarea', Object.assign({ class: 'pb-input pbl-ta' }, attrs));

function selectEl(options, value, onChange, placeholder, attrs) {
  const sel = h('select', Object.assign({ class: 'pb-input' }, attrs || {}),
    placeholder != null ? h('option', { value: '' }, placeholder) : null,
    options.map(o => typeof o === 'object' ? h('option', { value: o.value }, o.label) : h('option', { value: o }, o)));
  const want = value == null ? '' : String(value);
  sel.value = want;
  if (want && sel.value !== want) {
    sel.insertBefore(h('option', { value: want }, want + ' (not in Meesho\'s list)'), sel.options[placeholder != null ? 1 : 0] || null);
    sel.value = want;
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return h('div', { class: 'pb-select' }, sel, svgEl(SVG.chev));
}
function field(label, control, o) {
  o = o || {};
  const target = o.forEl || (control.matches && control.matches('input,select,textarea') ? control : control.querySelector('input,select,textarea')) || control;
  if (!target.id) target.id = 'pbl-f' + uid();
  return h('div', { class: 'pb-field pbl-field' + (o.wide ? ' is-wide' : '') },
    h('label', { class: 'pb-field__label', for: target.id }, label, o.required ? h('span', { class: 'pbl-req', title: 'Compulsory in Meesho\'s template' }, ' *') : null),
    control,
    o.hint ? h('div', { class: 'pb-field__msg' }, o.hint) : null);
}
function checkbox(label, checked, onChange) {
  return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked, onchange: e => onChange(e.target.checked) }), h('span', null, label));
}
function shortHint(desc) {
  const d = String(desc).replace(/\s+/g, ' ').trim();
  if (d.length <= 150) return d;
  const cut = d.slice(0, 150); return h('span', { title: d }, cut.slice(0, cut.lastIndexOf(' ')) + '…');
}
function dropZone(o) {
  const inp = h('input', { type: 'file', id: o.id, accept: o.accept, multiple: o.multiple || null, 'aria-label': o.title });
  inp.addEventListener('change', () => { const fs = [...inp.files]; inp.value = ''; if (fs.length) o.onFiles(fs); });
  const zone = h('label', { class: 'drop pbl-drop' + (o.compact ? ' is-compact' : '') }, svgEl(o.icon || SVG.up), h('b', null, o.title), o.sub ? h('span', null, o.sub) : null, inp);
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('is-over'); const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])]; if (fs.length) o.onFiles(fs); });
  return zone;
}
function fileBtn(label, accept, onFile) {
  const id = 'pbl-fb' + uid();
  const inp = h('input', { type: 'file', id, accept, class: 'pbl-sr' });
  inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f) onFile(f); });
  return h('label', { class: 'pb-btn pb-btn--secondary pbl-filebtn', for: id }, inp, label);
}
function confirmBtn(label, armedLabel, onConfirm, kind) {
  let armed = false, timer = null;
  const b = btn(label, () => {
    if (!armed) { armed = true; b.textContent = armedLabel; b.classList.add('pbl-armed'); timer = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('pbl-armed'); }, 4000); return; }
    clearTimeout(timer); onConfirm();
  }, kind);
  return b;
}
function toast(msg, level) {
  if (!els.toasts || !els.toasts.isConnected) { els.toasts = h('div', { class: 'pbl-toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(els.toasts); }
  const t = h('div', { class: 'pb-toast' + (level === 'error' ? ' is-error' : '') }, h('span', null, msg));
  els.toasts.append(t);
  while (els.toasts.children.length > 2) els.toasts.firstChild.remove();
  setTimeout(() => t.remove(), level === 'error' ? 6500 : 3600);
}
function setBusy(msg) {
  if (!els.busy || !els.busy.isConnected) { els.busy = h('div', { class: 'pbl-busy', 'aria-live': 'polite' }, h('div', null, h('span'))); document.body.append(els.busy); }
  if (msg) { els.busy.querySelector('span').textContent = msg; els.busy.classList.add('is-on'); } else els.busy.classList.remove('is-on');
}

/* ------------------------------------------------------------- storage */

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (s && typeof s === 'object') return Object.assign(defaultSettings(), s, { details: Object.assign({}, s.details), chart: Object.assign({}, s.chart), sizes: Array.isArray(s.sizes) ? s.sizes : [] });
  } catch (e) { /* storage off */ }
  return defaultSettings();
}
let saveTimer = null;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 350); }
function saveNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.S)); } catch (e) { /* ignore */ }
  idbSet('work', state.W).catch(() => {});
}
let dbPromise = null;
function idb() {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      try {
        const rq = indexedDB.open(IDB_NAME, 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      } catch (e) { rej(e); }
    });
  }
  return dbPromise;
}
async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const rq = db.transaction('kv').objectStore('kv').get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); }
async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }

function normalizeWork(w) {
  const W = defaultWork();
  W.images = w.images && typeof w.images === 'object' ? w.images : {};
  W.catalogues = Array.isArray(w.catalogues) && w.catalogues.length ? w.catalogues.map(c => Object.assign(newCatalogue(), c)) : W.catalogues;
  W.colours = Array.isArray(w.colours) ? w.colours.map(c => Object.assign({ id: uid(), key: '', label: '', meesho: '', front: '', back: '', side: '', cat: W.catalogues[0].id }, c)) : [];
  W.pendingLinks = Array.isArray(w.pendingLinks) ? w.pendingLinks : [];
  for (const c of W.colours) for (const v of VIEWS) if (c[v] && !W.images[c[v]]) c[v] = '';
  for (const c of W.catalogues) if (c.cover && !W.images[c.cover]) c.cover = '';
  return W;
}

/* ------------------------------------------------------------- template */

async function applyTemplate(bytes, name, fromStore) {
  const tpl = await loadTemplate(bytes);
  tpl.fileName = name || '';
  const S = state.S, P = tpl.prefill, R = tpl.schema.byRole, copied = { details: 0, sizes: 0 };
  for (const [k, v] of Object.entries(P.details)) if (!String(S.details[k] || '').trim()) { S.details[k] = v; copied.details++; }
  if (!S.sizes.length && P.sizes.length) { S.sizes = P.sizes.slice(); copied.sizes = P.sizes.length; }
  for (const [s, ch] of Object.entries(P.chart)) { const cur = S.chart[s] = S.chart[s] || {}; for (const [m, v] of Object.entries(ch)) if (!cur[m]) cur[m] = v; }
  if (!S.price && P.price) S.price = P.price;
  if (!S.mrp && P.mrp) S.mrp = P.mrp;
  if (!S.productName && P.productName) S.productName = P.productName;
  for (const c of R.generic) {
    if (String(S.details[c.name] || '').trim()) continue;
    if (/country of origin/i.test(c.name) && (!c.options || c.options.includes('India'))) S.details[c.name] = 'India';
    else if (c.kind === 'list' && c.options && c.options.length === 1) S.details[c.name] = c.options[0];
  }
  const sOpts = R.size.options;
  if (sOpts) S.sizes = S.sizes.filter(s => sOpts.includes(s)).sort((a, b) => sOpts.indexOf(a) - sOpts.indexOf(b));
  tpl.copied = fromStore ? null : copied;
  state.tpl = tpl;
  remapColours();
  if (!fromStore) { try { await idbSet('template', { bytes, name, savedAt: Date.now() }); } catch (e) { tpl.notSaved = true; } }
  saveNow();
}

async function onTemplateFile(file) {
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) { toast('Choose the .xlsx file you downloaded from Meesho.', 'error'); return; }
  setBusy('Reading the template…');
  try {
    await applyTemplate(await file.arrayBuffer(), file.name, false);
    const pend = state.S.pendingPreset && allPresets().find(p => p.id === state.S.pendingPreset);
    delete state.S.pendingPreset;
    if (pend) { const r = applyPreset(pend); state.presetResult = { name: pend.name, ...r }; }
    await applyShopDefaults();
    toast(state.tpl.info.category + ' template loaded' + (pend ? ' and "' + pend.name + '" filled in.' : '.'));
  } catch (e) {
    toast(e && e.message ? e.message : 'This file could not be read.', 'error');
  } finally { setBusy(null); renderAll(); }
}

function remapColours() {
  if (!state.tpl) return;
  const opts = state.tpl.schema.byRole.color.options;
  if (!opts) return;
  const dict = colourDict(opts);
  for (const c of state.W.colours) {
    if (c.meesho && opts.includes(c.meesho)) continue;
    const k = normKey(c.label);
    c.meesho = (dict[k] || dict[k.replace(/.*?(pink|green|blue|red|yellow|grey|gray|purple|brown)$/, '$1')] || defaultMeeshoColour());
  }
}
/** A ready-made set's colour (e.g. Multicolor for mixed packs), when the template lists it. */
function defaultMeeshoColour() {
  const want = state.S.presetColour, opts = state.tpl && state.tpl.schema.byRole.color.options;
  if (!want) return '';
  if (!opts) return want;
  return matchOption(opts, want);
}

/* --------------------------------------------------------------- photos */

async function inspectImage(file) {
  const out = { format: '', cmyk: false, w: 0, h: 0, thumb: '' };
  try {
    const b = new Uint8Array(await file.slice(0, 262144).arrayBuffer());
    if (b[0] === 0xFF && b[1] === 0xD8) {
      out.format = 'jpeg';
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xFF) { i++; continue; }
        const m = b[i + 1];
        if (m === 0xFF) { i++; continue; }
        if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
        const len = (b[i + 2] << 8) | b[i + 3];
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { out.h = (b[i + 5] << 8) | b[i + 6]; out.w = (b[i + 7] << 8) | b[i + 8]; out.cmyk = b[i + 9] === 4; break; }
        if (m === 0xDA) break;
        i += 2 + len;
      }
    } else if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E) {
      out.format = 'png';
      out.w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0; out.h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
    } else if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) out.format = 'webp';
    else if (String.fromCharCode(b[4], b[5], b[6], b[7]) === 'ftyp') out.format = /avif/.test(String.fromCharCode(...b.slice(8, 12))) ? 'avif' : 'heic';
    else out.format = (file.type.split('/')[1] || 'unknown').toLowerCase();
  } catch (e) { /* unreadable header */ }
  try { out.thumb = await makeThumb(file); } catch (e) { out.thumb = ''; }
  return out;
}
async function makeThumb(file) {
  let src, w, hgt;
  try { src = await createImageBitmap(file); w = src.width; hgt = src.height; }
  catch (e) {
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    w = src.naturalWidth; hgt = src.naturalHeight;
  }
  const s = Math.min(1, 300 / Math.max(w, hgt));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(hgt * s));
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(src, 0, 0, cv.width, cv.height);
  if (src.close) src.close();
  return cv.toDataURL('image/jpeg', 0.8);
}

async function addPhotos(files, target) {
  if (!state.tpl) return;
  const list = [...files].filter(f => /^image\//i.test(f.type) || IMG_EXT.test(f.name));
  if (!list.length) { toast('Those files are not photos.', 'error'); return; }
  list.sort((a, b) => natural(a.name, b.name));
  const W = state.W; const added = [];
  setBusy('Reading ' + plural(list.length, 'photo') + '…');
  try {
    for (const f of list) {
      if (Object.values(W.images).some(im => im.name === f.name && im.size === f.size)) continue;
      let key = normKey(f.name) || 'photo';
      if (W.images[key]) { let i = 2; while (W.images[key + '_' + i]) i++; key = key + '_' + i; }
      const info = await inspectImage(f);
      W.images[key] = Object.assign({ key, name: f.name, size: f.size, link: '', how: '' }, info);
      added.push(key);
    }
  } finally { setBusy(null); }
  if (!added.length) { toast('Those photos are already here.'); return; }
  if (target && target.type !== 'tray') { placePhoto(added[0], target); autoSort(added.slice(1)); } else autoSort(added);
  commit();
  const left = added.filter(k => locate(k).type === 'tray').length;
  toast(plural(added.length, 'photo') + ' added' + (left ? ', ' + left + ' still to place' : ', all sorted'));
}

function newColour(label, meesho, key) {
  return { id: 'k' + uid(), key: key || normKey(label), label: label || '', meesho: meesho || defaultMeeshoColour(), front: '', back: '', side: '', cat: state.W.catalogues[0].id };
}
function autoSort(keys) {
  const W = state.W;
  const dict = colourDict(state.tpl.schema.byRole.color.options);
  for (const k of keys) {
    const cls = classifyName(W.images[k].name, dict);
    if (cls.type === 'colour') {
      let col = W.colours.find(c => c.key === cls.colour.key);
      if (!col) { col = newColour(cls.colour.label, cls.colour.meesho, cls.colour.key); W.colours.push(col); }
      const view = cls.view && !col[cls.view] ? cls.view : VIEWS.find(v => !col[v]);
      if (view) col[view] = k;
    } else if (cls.type === 'set') {
      const cat = W.catalogues.find(c => !c.cover);
      if (cat) cat.cover = k;
    }
  }
}
function groupInThrees(keys) {
  const W = state.W;
  const list = keys.slice().sort((a, b) => natural(W.images[a].name, W.images[b].name));
  for (let i = 0; i < list.length; i += 3) {
    const col = newColour('', '', 'g' + uid());
    list.slice(i, i + 3).forEach((k, j) => { col[VIEWS[j]] = k; });
    W.colours.push(col);
  }
  commit();
  const made = Math.ceil(list.length / 3);
  toast(made === 1 ? 'Made 1 colour. Name it and pick its Meesho colour.' : 'Made ' + made + ' colours. Name each one and pick its Meesho colour.');
}

function locate(key) {
  const W = state.W;
  for (const c of W.colours) for (const v of VIEWS) if (c[v] === key) return { type: 'slot', colourId: c.id, view: v };
  for (const cat of W.catalogues) if (cat.cover === key) return { type: 'cover', catId: cat.id };
  return { type: 'tray' };
}
function getAt(t) {
  const W = state.W;
  if (t.type === 'slot') { const c = W.colours.find(x => x.id === t.colourId); return c ? c[t.view] : ''; }
  if (t.type === 'cover') { const c = W.catalogues.find(x => x.id === t.catId); return c ? c.cover : ''; }
  return '';
}
function setAt(t, key) {
  const W = state.W;
  if (t.type === 'slot') { const c = W.colours.find(x => x.id === t.colourId); if (c) c[t.view] = key || ''; }
  else if (t.type === 'cover') { const c = W.catalogues.find(x => x.id === t.catId); if (c) c.cover = key || ''; }
}
/** Put a photo somewhere; whatever was there swaps back to where the photo came from. */
function placePhoto(key, target) {
  const from = locate(key);
  if (target.type === 'tray') { setAt(from, ''); return; }
  const occupant = getAt(target);
  if (occupant === key) return;
  setAt(target, key);
  if (from.type !== 'tray') setAt(from, occupant || '');
}
function placedSet() {
  const W = state.W; const s = new Set();
  for (const c of W.colours) for (const v of VIEWS) if (c[v]) s.add(c[v]);
  for (const cat of W.catalogues) if (cat.cover) s.add(cat.cover);
  return s;
}
function unplacedKeys() {
  const W = state.W; const placed = placedSet();
  return Object.keys(W.images).filter(k => !placed.has(k)).sort((a, b) => natural(W.images[a].name, W.images[b].name));
}
const catOf = col => state.W.catalogues.some(c => c.id === col.cat) ? col.cat : state.W.catalogues[0].id;
function usedPhotoKeys() {
  const W = state.W; const set = new Set();
  for (const c of W.colours) for (const v of VIEWS) if (c[v] && W.images[c[v]]) set.add(c[v]);
  if (state.S.placement !== 'none') for (const cat of W.catalogues) if (cat.cover && W.images[cat.cover] && W.colours.some(c => catOf(c) === cat.id)) set.add(cat.cover);
  return [...set].sort((a, b) => natural(W.images[a].name, W.images[b].name));
}
function placeOf(key) {
  const W = state.W; const at = locate(key);
  if (at.type === 'slot') { const c = W.colours.find(x => x.id === at.colourId); return (c.label || 'Unnamed colour') + ', ' + at.view; }
  if (at.type === 'cover') { const i = W.catalogues.findIndex(x => x.id === at.catId); return 'Collage, ' + catName(W.catalogues[i], i).toLowerCase(); }
  return 'Not placed';
}
const catName = (c, i) => c.name ? 'Catalogue ' + c.name : 'Catalogue ' + (i + 1);
function removeColour(id) { const W = state.W; W.colours = W.colours.filter(c => c.id !== id); commit(); }
function removePhotos(keys) {
  const W = state.W;
  for (const k of keys) { placePhoto(k, { type: 'tray' }); delete W.images[k]; }
  if (keys.includes(state.selected)) state.selected = null;
  commit(); toast(plural(keys.length, 'photo') + ' removed.');
}
function swatchOf(col) {
  const tryName = n => { const k = normKey(n); if (SWATCH[k]) return SWATCH[k]; const last = normKey(String(n || '').trim().split(/\s+/).pop()); return SWATCH[last] || ''; };
  return tryName(col.label) || tryName(col.meesho) || '';
}
function swatchStyle(col) { const c = swatchOf(col); return c ? { '--sw': c } : null; }

/* ---------------------------------------------------------------- links */

function onMatchLinks(text) {
  const entries = parseLinkText(text);
  if (!entries.length) { toast('No links found. Links start with https://', 'error'); return; }
  const W = state.W; const used = usedPhotoKeys();
  const { pairs, unmatched } = matchLinks(entries, used.map(k => ({ key: k, name: W.images[k].name })));
  for (const p of pairs) { W.images[p.key].link = p.url; W.images[p.key].how = p.how; }
  const assigned = new Set(Object.values(W.images).map(i => i.link).filter(Boolean));
  W.pendingLinks = unmatched.filter(u => !assigned.has(u));
  state.linkNote = { total: entries.length, matched: pairs.length, missing: used.filter(k => !W.images[k].link).length };
  commit();
}
function onMatchByOrder() {
  const W = state.W; const missing = usedPhotoKeys().filter(k => !W.images[k].link);
  const n = Math.min(missing.length, W.pendingLinks.length);
  for (let i = 0; i < n; i++) { const im = W.images[missing[i]]; im.link = W.pendingLinks[i]; im.how = 'order'; }
  W.pendingLinks = W.pendingLinks.slice(n);
  state.linkNote = null;
  commit();
  toast(plural(n, 'link') + ' matched by order. Check a few by opening them.');
}
async function onLinksFile(file) {
  try {
    const text = /\.xlsx$/i.test(file.name) ? await xlsxToText(await file.arrayBuffer()) : await file.text();
    const ta = els.root && els.root.querySelector('#pbl-linkPaste'); if (ta) ta.value = text.slice(0, 100000);
    onMatchLinks(text);
  } catch (e) { toast('That file could not be read.', 'error'); }
}
function clearLinks() {
  for (const im of Object.values(state.W.images)) { im.link = ''; im.how = ''; }
  state.W.pendingLinks = []; state.linkNote = null; commit();
}

/* ------------------------------------------------------------- download */

let dlPromise = null;
function downloadsCap() {
  if (!dlPromise) {
    dlPromise = window.claude && typeof window.claude.use === 'function'
      ? Promise.resolve().then(() => window.claude.use('downloads')).catch(() => null)
      : Promise.resolve(null);
  }
  return dlPromise;
}
function fileName(i, n) {
  const d = new Date();
  const stamp = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
  return 'Meesho-' + (alnum(state.tpl.info.category) || 'Bulk') + '-' + stamp + (n > 1 ? '-part' + (i + 1) : '') + '.xlsx';
}
async function saveFile(name, blob) {
  const dl = await downloadsCap();
  if (dl) {
    try { await dl.save({ filename: name, data: blob }); toast('Saved ' + name); return true; }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') return false;
      toast(code === 'rate_limited' ? 'A save prompt is already open.' : 'The file could not be saved here.' + (e && e.message ? ' ' + e.message : ''), 'error');
      return false;
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name, style: { display: 'none' } });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    toast(window.claude ? 'If nothing downloads, open this tool from Claude and try again.' : 'Downloading ' + name);
    return true;
  } catch (e) { toast('The browser blocked the download.', 'error'); return false; }
}
async function downloadPart(plan, i) {
  setBusy('Making the Excel file…');
  let out;
  try { out = await writeWorkbook(state.tpl, plan.parts[i].rows, { returnsLess: plan.returnsLess }); }
  catch (e) { setBusy(null); toast('The file could not be made: ' + (e && e.message ? e.message : e), 'error'); return; }
  setBusy(null);
  if (await saveFile(fileName(i, plan.parts.length), out.blob)) { state.downloaded = true; renderSteps(); if (state.step === 'download') rerender(); }
}
function newBatch() {
  state.W = defaultWork(); state.selected = null; state.linkNote = null; state.downloaded = false;
  saveNow(); go('photos'); toast('New batch started. Your details and sizes are kept.');
}


/* ------------------------------------------------------- shop defaults */

/** Name and address from PakkaBill's Shop settings, for Meesho's manufacturer and packer details. */
async function readShop() {
  let biz = null;
  try {
    biz = await new Promise((res, rej) => {
      const rq = indexedDB.open('pakkabill', 1);
      rq.onupgradeneeded = () => { rq.transaction.abort(); }; // never create PakkaBill's database here
      rq.onerror = () => rej(rq.error);
      rq.onsuccess = () => {
        const db = rq.result;
        try {
          const g = db.transaction('kv').objectStore('kv').get('business');
          g.onsuccess = () => { res(g.result || null); db.close(); };
          g.onerror = () => { rej(g.error); db.close(); };
        } catch (e) { db.close(); rej(e); }
      };
    });
  } catch (e) { biz = null; }
  if (!biz) { try { biz = JSON.parse(localStorage.getItem('pakkabill:business') || 'null'); } catch (e) { biz = null; } }
  if (!biz || !String(biz.name || '').trim()) return '';
  const addr = String(biz.address || '').split(/\s*\n\s*/).map(s => s.trim()).filter(Boolean).join(', ');
  return [String(biz.name).trim(), addr].filter(Boolean).join(', ');
}
async function applyShopDefaults() {
  if (!state.tpl) return;
  const maker = state.tpl.schema.byRole.generic.find(c => /^manufacturer/i.test(c.name));
  if (!maker || String(state.S.details[maker.name] || '').trim()) return;
  const shop = await readShop();
  if (!shop) return;
  state.S.details[maker.name] = shop;
  state.shopNote = true;
  saveSoon();
}

/* -------------------------------------------------------------- render */

function currentPlan() { return state.tpl ? buildPlan(state.tpl, state.S, state.W) : null; }
let statusTimer = null;
function changed() { saveSoon(); clearTimeout(statusTimer); statusTimer = setTimeout(renderSteps, 200); }
function commit() { saveSoon(); rerender(); renderSteps(); }
function rerender() { const y = window.scrollY; renderPanel(); window.scrollTo(0, y); }
function renderAll() { renderPill(); renderSteps(); renderPanel(); }
function go(id) {
  if (id !== 'template' && !state.tpl) return;
  state.step = id; state.selected = null;
  renderAll();
  if (els.root) {
    const top = els.root.getBoundingClientRect().top + window.scrollY - 70;
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top) });
    const cur = els.steps && els.steps.querySelector('[aria-current="step"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const h2 = els.panel && els.panel.querySelector('h2');
    if (h2) { h2.setAttribute('tabindex', '-1'); h2.focus({ preventScroll: true }); }
  }
}

function renderPill() {
  if (!els.pill) return;
  els.pill.className = 'pill ' + (state.tpl ? 'pill--est' : 'pill--void');
  els.pill.textContent = state.tpl ? state.tpl.info.category + ' template' : 'No template yet';
}
function stepStatus(plan) {
  const out = { template: state.tpl ? { cls: 'is-done', text: 'Loaded' } : { cls: 'is-open', text: 'Start here' } };
  if (!state.tpl) { for (const s of STEPS.slice(1)) out[s.id] = { cls: 'is-locked', text: '' }; return out; }
  const count = where => { const c = { error: 0, warn: 0 }; for (const i of plan.issues) if (i.where === where) c[i.level]++; return c; };
  const hasPhotos = Object.keys(state.W.images).length > 0 || state.W.colours.length > 0;
  for (const id of ['details', 'sizes', 'photos']) {
    const c = count(id);
    if (id === 'photos' && !hasPhotos) out[id] = { cls: '', text: 'Add photos' };
    else out[id] = c.error ? { cls: 'is-open', text: c.error + ' to fix' } : c.warn ? { cls: 'is-warn', text: c.warn + ' to check' } : { cls: 'is-done', text: 'Ready' };
  }
  const used = usedPhotoKeys().length, c = count('links');
  out.links = !used ? { cls: '', text: 'After photos' } : plan.counts.missingLinks ? { cls: 'is-open', text: plan.counts.missingLinks + ' missing' } : c.error ? { cls: 'is-open', text: c.error + ' to fix' } : { cls: 'is-done', text: 'Ready' };
  const errs = plan.issues.filter(i => i.level === 'error').length;
  out.download = errs ? { cls: '', text: 'Not ready yet' } : { cls: 'is-done', text: state.downloaded ? 'Downloaded' : 'Ready' };
  return out;
}
function renderSteps() {
  if (!els.steps || !els.steps.isConnected) return;
  const st = stepStatus(currentPlan());
  els.steps.replaceChildren(...STEPS.map((s, i) => {
    const x = st[s.id], cur = state.step === s.id;
    return h('li', null, h('button', {
      type: 'button', class: 'pbl-step ' + x.cls, disabled: x.cls === 'is-locked' || null, 'aria-current': cur ? 'step' : null, onclick: () => go(s.id)
    }, h('span', { class: 'n', 'aria-hidden': 'true' }, x.cls === 'is-done' && !cur ? '✓' : String(i + 1)),
      h('span', { class: 't' }, s.title), x.text ? h('span', { class: 's' }, x.text) : null));
  }));
}
function renderPanel() {
  if (!els.panel || !els.panel.isConnected) return;
  const fn = { template: renderTemplate, details: renderDetails, sizes: renderSizes, photos: renderPhotos, links: renderLinks, download: renderDownload }[state.step];
  els.panel.replaceChildren(...fn());
}
function title(text, lede) { return [h('h2', { class: 'form-sec__title' }, text), lede ? h('p', { class: 'pbl-lede' }, lede) : null]; }
function navFooter() {
  const i = STEPS.findIndex(s => s.id === state.step);
  const prev = STEPS[i - 1], next = STEPS[i + 1];
  return h('div', { class: 'pbl-nav' },
    prev ? btn('Back', () => go(prev.id), 'pb-btn--ghost') : h('span'),
    next ? btn('Next: ' + next.title, () => go(next.id), 'pb-btn--primary', { disabled: !state.tpl || null }) : null);
}

/* ------------------------------------------------------- ready-made sets */
/* Details, sizes and a size chart saved by name. They are matched to any
   template's fields by name, so one set works for every blouse template. */
const PRESET_KEY = 'pb-listing-presets';
const BUILT_IN_PRESETS = [{
  id: 'sv-lycra-blouse', builtIn: true,
  name: 'Shree Vastraa: Lycra stretchable blouse, pack of 5',
  details: {
    'Type of Closure': 'Slip-on', 'Country of Origin': 'India',
    'Manufacturer Name': 'shree vastraa', 'Manufacturer Address': 'shivpuri', 'Manufacturer Pincode': '473551',
    'Packer Name': 'shree vastraa', 'Packer Address': 'shivpuri', 'Packer Pincode': '473551',
    'Back Type': 'Round Neck', 'Fabric': 'Lycra', 'Generic Name': 'Blouses', 'Length': 'Regular',
    'Loom Type': 'Powerloom', 'Neck Type': 'Round Neck', 'Net Quantity (N)': 'Pack of 5', 'Occassion': 'Party',
    'Padding': 'Non-Padded', 'Pattern': 'Solid', 'Print or Pattern Type': 'Solid',
    'Sleeve Length': 'Three-Quarter Sleeves', 'Sleeve Styling': 'Regular', 'Stitch Type': 'Stiched', 'Type': 'Stretchable'
  },
  packerSame: true,
  colour: 'Multicolor',
  sizes: ['26', '28', '30', '32', '34', '36', '38', '40', 'Free-Size: 26-30', 'Free-Size: 30-34', 'Free-Size: 36-40', 'L', 'XL', 'XXL'],
  // bust, waist, shoulder, length (inch)
  chart: {
    '26': ['26-30', '26-30', '12.5', '14'], '28': ['26-30', '26-30', '12.5', '14'], '30': ['26-30', '26-30', '12.5', '14'],
    '32': ['30-34', '30-34', '13.5', '15'], '34': ['30-34', '30-34', '13.5', '15'],
    '36': ['36-40', '36-40', '14.5', '16'], '38': ['36-40', '36-40', '14.5', '16'], '40': ['36-40', '36-40', '14.5', '16'],
    'Free-Size: 26-30': ['26-30', '26-30', '13.5', '14'], 'Free-Size: 30-34': ['30-34', '30-34', '14.5', '15'], 'Free-Size: 36-40': ['36-40', '36-40', '15.5', '16'],
    'L': ['26-30', '26-30', '13.5', '14'], 'XL': ['30-34', '30-34', '14.5', '15'], 'XXL': ['36-40', '36-40', '15.5', '16']
  }
}];
const CHART_PARTS = ['bust', 'waist', 'shoulder', 'length'];
const presetKey = t => String(t == null ? '' : t).toLowerCase().replace(/inch(es)?|["”]/g, '').replace(/[^a-z0-9.]+/g, '');
function userPresets() {
  try { const l = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); return Array.isArray(l) ? l.filter(p => p && p.id && p.name) : []; } catch (e) { return []; }
}
function allPresets() { return [...userPresets(), ...BUILT_IN_PRESETS]; }
function saveUserPresets(list) {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(list)); return true; } catch (e) { toast('This browser would not save it. Check that storage is allowed.', 'error'); return false; }
}
/** The template's own spelling of a value, matched loosely (case, spaces, "in"). */
function matchOption(options, v) {
  if (!options) return String(v);
  if (options.includes(String(v))) return String(v);
  const k = presetKey(v);
  const hit = options.find(o => presetKey(o) === k || presetKey(o) === k + 'in' || presetKey(o).replace(/in$/, '') === k);
  if (hit) return hit;
  if (isNumericText(String(v))) return options.find(o => isNumericText(o) && Math.abs(+o - +v) < 1e-9) || '';
  return '';
}
function chartOf(P, size) {
  const row = (P.chart || {})[size];
  if (!row) return {};
  if (Array.isArray(row)) { const o = {}; row.forEach((v, i) => { if (v !== '' && v != null) o[CHART_PARTS[i]] = v; }); return o; }
  return row;
}
/** Puts a ready-made set into the listing. Returns what was filled and what the template has no place for. */
function applyPreset(P) {
  const S = state.S, R = state.tpl.schema.byRole, gen = R.generic;
  const res = { details: 0, sizes: 0, chart: 0, missed: [] };
  for (const [name, v] of Object.entries(P.details || {})) {
    const c = gen.find(x => presetKey(x.name) === presetKey(name));
    if (!c) continue; // this category has no such field
    const val = c.kind === 'list' ? matchOption(c.options, v) : String(v);
    if (!val) { res.missed.push(c.name + ': ' + v); continue; }
    S.details[c.name] = val; res.details++;
  }
  if (P.packerSame != null) S.packerSame = !!P.packerSame;
  for (const k of ['productName', 'price', 'mrp', 'skuPrefix']) if (P[k]) S[k] = P[k];
  if (P.returnsLess != null && P.returnsLess !== '') S.returnsLess = P.returnsLess;
  if (P.addColour != null) S.addColour = !!P.addColour;
  const sOpts = R.size.options, sizes = [];
  for (const sz of P.sizes || []) {
    const t = sOpts ? matchOption(sOpts, sz) : String(sz);
    if (!t) { res.missed.push('Size ' + sz); continue; }
    if (!sizes.includes(t)) sizes.push(t);
    const want = chartOf(P, sz), ch = S.chart[t] = S.chart[t] || {};
    for (const m of R.measure) {
      const key = Object.keys(want).find(k => presetKey(m.name).startsWith(presetKey(k)) || presetKey(m.name) === presetKey(k));
      if (!key) continue;
      const val = m.options ? matchOption(m.options, want[key]) : String(want[key]);
      if (!val) { res.missed.push(m.name.replace(/\s*size$/i, '') + ' ' + want[key] + ' for size ' + sz); continue; }
      ch[m.name] = val; res.chart++;
    }
  }
  if (sizes.length) {
    S.sizes = sOpts ? sizes.sort((a, b) => sOpts.indexOf(a) - sOpts.indexOf(b)) : sizes;
    res.sizes = sizes.length; S.chartTypical = false; S.chartChecked = true;
  }
  S.presetColour = P.colour || '';
  remapColours();
  S.presetId = P.id;
  saveNow();
  return res;
}
function usePreset(P) {
  if (!state.tpl) { state.S.pendingPreset = P.id; saveNow(); toast('Choose your Meesho template: "' + P.name + '" fills in as soon as it loads.'); rerender(); return; }
  const r = applyPreset(P);
  state.presetResult = { name: P.name, ...r };
  state.shopNote = false;
  commit();
  toast('Filled ' + plural(r.details, 'detail') + ', ' + plural(r.sizes, 'size') + ' and ' + plural(r.chart, 'measurement') + '.');
}
function saveCurrentAsPreset(name) {
  const S = state.S, nm = String(name || '').trim();
  if (!nm) { toast('Give the set a name first.', 'error'); return; }
  const chart = {};
  for (const sz of S.sizes) {
    const row = {};
    for (const [m, v] of Object.entries(S.chart[sz] || {})) { const part = CHART_PARTS.find(p => presetKey(m).startsWith(p)) || m; if (v) row[part] = v; }
    chart[sz] = row;
  }
  const details = {};
  for (const [k, v] of Object.entries(S.details)) if (String(v || '').trim()) details[k] = v;
  const P = { id: 'u' + uid(), name: nm.slice(0, 80), details, packerSame: S.packerSame, sizes: S.sizes.slice(), chart,
    productName: S.productName, price: S.price, mrp: S.mrp, skuPrefix: S.skuPrefix, returnsLess: S.returnsLess, addColour: S.addColour,
    colour: S.presetColour || '', savedAt: Date.now() };
  const list = userPresets().filter(x => x.name.toLowerCase() !== P.name.toLowerCase());
  if (saveUserPresets([P, ...list].slice(0, 30))) { S.presetId = P.id; saveNow(); toast('Saved "' + P.name + '". Pick it next time to fill everything in one tap.'); rerender(); }
}
function deletePreset(id) { saveUserPresets(userPresets().filter(p => p.id !== id)); rerender(); }
function presetFacts(P) {
  const d = P.details || {}, bits = [];
  const f = k => { const e = Object.entries(d).find(([n]) => presetKey(n) === presetKey(k)); return e ? e[1] : ''; };
  if (f('Fabric')) bits.push(f('Fabric'));
  if (f('Net Quantity (N)')) bits.push(f('Net Quantity (N)'));
  if (f('Sleeve Length')) bits.push(f('Sleeve Length'));
  if (P.sizes && P.sizes.length) bits.push(plural(P.sizes.length, 'size') + ' with size chart');
  const maker = [f('Manufacturer Name'), f('Manufacturer Address'), f('Manufacturer Pincode')].filter(Boolean).join(', ');
  if (maker) bits.push('Maker: ' + maker);
  return bits.join(' · ');
}
function presetsEl(where) {
  const S = state.S, list = allPresets();
  const nameIn = input({ type: 'text', maxlength: 80, placeholder: 'For example: Cotton blouse, pack of 3', autocomplete: 'off', 'aria-label': 'Name for this set' });
  const box = h('section', { class: 'pbl-presets', 'aria-labelledby': 'pbl-pre-h' },
    h('h3', { class: 'pbl-h3', id: 'pbl-pre-h' }, 'Ready-made details'),
    h('p', { class: 'fine' }, 'One tap fills the product details, sizes and size chart. Choices this template doesn\'t have are left for you to pick.'),
    h('ul', { class: 'pbl-preset-list' }, list.map(P => h('li', { class: 'pbl-preset' + (S.presetId === P.id || S.pendingPreset === P.id ? ' is-on' : '') },
      h('div', { class: 'pbl-preset__txt' },
        h('b', null, P.name),
        h('span', null, presetFacts(P)),
        S.pendingPreset === P.id && !state.tpl ? h('span', { class: 'pbl-preset__wait' }, 'Fills in when you choose the template.') : null),
      h('div', { class: 'pbl-preset__btns' },
        btn(state.tpl ? (S.presetId === P.id ? 'Fill again' : 'Use these details') : 'Use with my template', () => usePreset(P), S.presetId === P.id ? 'pb-btn--secondary' : 'pb-btn--primary'),
        P.builtIn ? null : confirmBtn('Delete', 'Tap again to delete', () => deletePreset(P.id), 'pb-btn--ghost is-danger'))))));
  const r = state.presetResult;
  if (r && where === 'details') {
    box.append(banner(r.missed.length ? 'warn' : 'ok', 'Filled from "' + r.name + '": ' + plural(r.details, 'detail') + ', ' + plural(r.sizes, 'size') + ', ' + plural(r.chart, 'measurement') + '.' +
      (r.missed.length ? ' Not in this template\'s lists, so pick these yourself: ' + r.missed.slice(0, 6).join('; ') + (r.missed.length > 6 ? ' and ' + (r.missed.length - 6) + ' more' : '') + '.' : '')));
  }
  if (state.tpl && where === 'details') {
    box.append(h('div', { class: 'pbl-actions pbl-preset-save' }, h('div', { class: 'pbl-grow' }, nameIn), btn('Save my details as a set', () => saveCurrentAsPreset(nameIn.value))));
  }
  return box;
}

/* ---- step 1 */
function renderTemplate() {
  const t = state.tpl;
  const out = title('Meesho template', 'Start with the category template from your Meesho supplier panel. The tool reads its fields and dropdown lists, so the Excel you download matches it exactly.');
  if (t) {
    const sch = t.schema; const fields = sch.columns.filter(c => c.role !== 'skip'); const req = fields.filter(c => c.required).length;
    out.push(h('div', { class: 'pbl-tpl' },
      h('div', { class: 'pbl-tpl__sheet', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'), h('span'), h('span'), h('span')),
      h('div', null,
        h('p', { class: 'pbl-tpl__name' }, t.info.category + ' template'),
        t.fileName ? h('p', { class: 'pbl-tpl__file' }, t.fileName) : null,
        h('ul', { class: 'pbl-facts' },
          t.info.id ? h('li', null, 'Category ID ' + t.info.id + (t.info.version ? ', version ' + t.info.version : '')) : null,
          h('li', null, plural(fields.length, 'field') + ', ' + req + ' compulsory'),
          h('li', null, plural(sch.byRole.image.length, 'photo column')),
          h('li', null, 'Up to ' + sch.maxRows + ' rows per file')))));
    if (t.copied && (t.copied.details || t.copied.sizes)) {
      out.push(banner('ok', 'Copied from your prefilled template: ' + [t.copied.details ? plural(t.copied.details, 'detail') : '', t.copied.sizes ? plural(t.copied.sizes, 'size') : ''].filter(Boolean).join(' and ') + '. Check them in the next steps.'));
    }
    if (t.notSaved) out.push(banner('warn', 'This browser would not keep the template, so you\'ll need to choose it again next time.'));
  }
  out.push(dropZone({ id: 'pbl-tplInput', accept: '.xlsx', title: t ? 'Replace the template' : 'Choose the template file', sub: 'or drop the .xlsx file here', compact: !!t, onFiles: fs => onTemplateFile(fs[0]) }));
  if (t) out.push(h('p', { class: 'fine' }, 'Saved on this device, so next time you can go straight to your photos.'));
  else {
    out.push(h('h3', { class: 'pbl-h3' }, 'Where to get it'), h('ol', { class: 'steps' },
      h('li', null, 'Open the Meesho supplier panel and go to Catalog Uploads.'),
      h('li', null, 'Choose to add catalogs in bulk and pick your category, for example Blouses.'),
      h('li', null, 'Download the template. A prefilled template works too; its details and sizes are copied in for you.')));
  }
  out.push(presetsEl('template'));
  out.push(navFooter());
  return out;
}

/* ---- step 2 */
function renderDetails() {
  const S = state.S, R = state.tpl.schema.byRole;
  const out = title('Product details', 'Fill these once. They go on every row and stay saved for your next catalogue.');
  out.push(presetsEl('details'));
  const nameEx = h('span');
  const updateName = () => { const b = String(S.productName || '').trim() || 'Women Cotton Blouse'; nameEx.textContent = S.addColour ? 'Each colour gets its name added: ' + b + ' - Wine' : 'Every colour gets exactly this name.'; };
  updateName();
  const retEx = h('span');
  const updateRet = () => { const p = +S.price, l = S.returnsLess === '' ? 31 : +S.returnsLess; retEx.textContent = p > 0 && l > 0 ? 'For a ₹' + fmt(p) + ' price that makes ₹' + fmt(p - l) + '.' : 'Meesho\'s template takes ₹31 off by default.'; };
  updateRet();
  const skuEx = h('span');
  const updateSku = () => { skuEx.textContent = 'Optional. Style IDs and SKUs are built from it, like ' + [alnum(S.skuPrefix).toUpperCase(), alnum(state.W.catalogues[0].name).toUpperCase().slice(0, 10) || 'C01', 'WINE'].filter(Boolean).join('-') + '-34.'; };
  updateSku();
  const lessIn = input({ type: 'number', inputmode: 'decimal', min: 1, step: 1, value: S.returnsLess, oninput: e => { S.returnsLess = e.target.value; changed(); updateRet(); } });
  out.push(h('h3', { class: 'pbl-h3' }, 'Name and price'), h('div', { class: 'pbl-grid' },
    field('Product name', input({ type: 'text', value: S.productName, maxlength: 200, placeholder: 'Women Cotton Striped Blouse', autocomplete: 'off', oninput: e => { S.productName = e.target.value; changed(); updateName(); } }),
      { required: true, wide: true, hint: h('span', null, nameEx, h('br'), checkbox('Add the colour name at the end', S.addColour, v => { S.addColour = v; changed(); updateName(); })) }),
    field('Meesho price (₹)', input({ type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: S.price, placeholder: '349', oninput: e => { S.price = e.target.value; changed(); updateRet(); } }), { required: true }),
    field('MRP (₹)', input({ type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: S.mrp, placeholder: '999', oninput: e => { S.mrp = e.target.value; changed(); } }), { required: true }),
    R.returns ? field(R.returns.name, h('div', { class: 'pbl-inline' }, h('span', null, 'Price minus ₹'), lessIn), { forEl: lessIn, hint: retEx }) : null,
    field('SKU prefix', input({ type: 'text', value: S.skuPrefix, maxlength: 12, placeholder: 'KC', autocomplete: 'off', oninput: e => { S.skuPrefix = e.target.value; changed(); updateSku(); } }), { hint: skuEx })));
  const gen = R.generic;
  const req = gen.filter(c => c.required), opt = gen.filter(c => !c.required);
  if (req.length) out.push(h('h3', { class: 'pbl-h3' }, 'Compulsory details'), h('div', { class: 'pbl-grid' }, req.map(detailField)));
  if (opt.length) {
    const filled = opt.filter(c => String(S.details[c.name] || '').trim()).length;
    const more = h('details', { class: 'pbl-more' }, h('summary', null, 'Optional details ', h('span', { class: 'fine-inline' }, filled ? filled + ' of ' + opt.length + ' filled' : plural(opt.length, 'field'))), h('div', { class: 'pbl-grid' }, opt.map(detailField)));
    if (state.openOptional) more.open = true;
    more.addEventListener('toggle', () => { state.openOptional = more.open; });
    out.push(more);
  }
  out.push(h('p', { class: 'fine' }, h('span', { class: 'pbl-req' }, '*'), ' Compulsory in Meesho\'s template. In text fields, {colour} becomes each colour\'s name and {catalogue} the catalogue\'s name.'));
  out.push(navFooter());
  return out;
}
function detailField(c) {
  const S = state.S, gen = state.tpl.schema.byRole.generic;
  const country = gen.find(x => /country of origin/i.test(x.name));
  const isIndia = !!country && String(S.details[country.name] || '').trim().toLowerCase() === 'india';
  const set = v => { S.details[c.name] = v; changed(); };
  const wide = /description/i.test(c.name);
  if (/^importer/i.test(c.name) && isIndia) {
    return field(c.name, input({ type: 'text', value: importerValue(c), disabled: true }), { required: c.required, hint: 'Filled in for you because the country of origin is India.' });
  }
  const makerOf = /^packer/i.test(c.name) ? gen.find(x => x.name.toLowerCase() === c.name.toLowerCase().replace('packer', 'manufacturer')) : null;
  if (makerOf) {
    const box = textarea({ rows: 2, 'data-packer': '1', value: S.packerSame ? (S.details[makerOf.name] || '') : (S.details[c.name] || ''), disabled: S.packerSame || null, oninput: e => set(e.target.value) });
    return field(c.name, box, { required: c.required, hint: checkbox('Same as ' + makerOf.name.toLowerCase(), S.packerSame, v => { S.packerSame = v; changed(); rerender(); }) });
  }
  const val = S.details[c.name] || '';
  const isMaker = /^manufacturer/i.test(c.name);
  let control;
  if (c.kind === 'list') control = selectEl(c.options, val, v => { set(v); if (c === country) rerender(); }, 'Choose');
  else if (c.kind === 'int') control = input({ type: 'number', inputmode: 'numeric', min: 0, step: 1, value: val, oninput: e => set(e.target.value) });
  else if (c.kind === 'decimal' || c.kind === 'price') control = input({ type: 'number', inputmode: 'decimal', min: 0, step: 'any', value: val, oninput: e => set(e.target.value) });
  else if (wide || /manufacturer|packer|importer|address/i.test(c.name)) {
    control = textarea({ rows: wide ? 4 : 2, value: val, oninput: e => { set(e.target.value); if (isMaker && S.packerSame) { const p = els.root && els.root.querySelector('[data-packer]'); if (p) p.value = e.target.value; } } });
  } else control = input({ type: 'text', value: val, autocomplete: 'off', oninput: e => set(e.target.value) });
  const hint = isMaker && state.shopNote ? 'Filled in from your Shop settings. Change it if the maker is someone else.' : (c.desc ? shortHint(c.desc) : null);
  return field(c.name, control, { required: c.required, wide, hint });
}

/* ---- step 3 */
function sortedSizes() {
  const S = state.S, opts = state.tpl.schema.byRole.size.options;
  return opts ? S.sizes.filter(s => opts.includes(s)).sort((a, b) => opts.indexOf(a) - opts.indexOf(b)) : S.sizes.slice();
}
function renderSizes() {
  const S = state.S, R = state.tpl.schema.byRole, opts = R.size.options;
  const out = title('Sizes', 'Every colour is listed in the sizes you pick. Measurements use Meesho\'s own dropdown values.');
  if (opts) {
    out.push(h('div', { class: 'chips pbl-chips', role: 'group', 'aria-label': 'Sizes' }, opts.map(o => {
      const on = S.sizes.includes(o);
      return h('button', { type: 'button', class: 'chip' + (on ? ' is-on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: () => {
        S.sizes = on ? S.sizes.filter(x => x !== o) : [...S.sizes, o];
        S.sizes.sort((a, b) => opts.indexOf(a) - opts.indexOf(b));
        commit();
      } }, o);
    })));
  } else {
    out.push(field('Sizes', input({ type: 'text', value: S.sizes.join(', '), placeholder: '32, 34, 36, 38, 40', oninput: e => { S.sizes = e.target.value.split(',').map(s => s.trim()).filter(Boolean); changed(); } }), { hint: 'Type the sizes exactly as Meesho writes them, separated by commas.' }));
  }
  const sel = sortedSizes(), ms = R.measure;
  if (!sel.length) out.push(h('p', { class: 'pbl-empty' }, 'Pick the sizes you sell.'));
  else if (!ms.length) out.push(h('p', { class: 'fine' }, 'This template has no measurement columns.'));
  else {
    out.push(h('h3', { class: 'pbl-h3' }, 'Measurements'), h('div', { class: 'table-wrap' }, h('table', { class: 'rtable pbl-chart' },
      h('thead', null, h('tr', null, h('th', { class: 'l', scope: 'col' }, 'Size'), ms.map(m => h('th', { class: 'l', scope: 'col' }, m.name.replace(/\s*size$/i, ''), m.required ? h('span', { class: 'pbl-req' }, ' *') : null)))),
      h('tbody', null, sel.map(s => h('tr', null, h('th', { class: 'l', scope: 'row' }, s), ms.map(m => h('td', { class: 'l' }, measureControl(s, m)))))))));
    out.push(h('div', { class: 'pbl-actions' }, btn('Fill empty cells with typical blouse measurements', fillTypical)));
    out.push(checkbox('I\'ve checked these against my own size chart', S.chartChecked, v => { S.chartChecked = v; changed(); }));
  }
  out.push(navFooter());
  return out;
}
function measureControl(size, m) {
  const S = state.S; const cur = (S.chart[size] || {})[m.name] || '';
  const set = v => { (S.chart[size] = S.chart[size] || {})[m.name] = v; changed(); };
  const label = m.name + ' for size ' + size;
  if (m.options) return selectEl(m.options, cur, set, '–', { 'aria-label': label });
  return input({ type: 'number', inputmode: 'decimal', step: 'any', value: cur, 'aria-label': label, oninput: e => set(e.target.value) });
}
function fillTypical() {
  const S = state.S; let n = 0;
  for (const s of sortedSizes()) {
    for (const m of state.tpl.schema.byRole.measure) {
      const ch = S.chart[s] = S.chart[s] || {};
      if (ch[m.name]) continue;
      const v = typicalMeasure(m.name, s, m.options || []);
      if (v) { ch[m.name] = v; n++; }
    }
  }
  if (n) { S.chartTypical = true; S.chartChecked = false; }
  commit();
  toast(n ? 'Filled ' + plural(n, 'cell') + '. Check them against your chart.' : 'Nothing to fill: every cell has a value.');
}

/* ---- step 4 */
function renderPhotos() {
  const W = state.W;
  const out = title('Photos and colours', 'Add the front, back and side photo of every colour. Photos named like "Wine front.jpg" sort themselves. To move a photo, tap it, then tap its new place.');
  if (W.colours.length) out.push(shadeCard());
  out.push(dropZone({ id: 'pbl-photoInput', accept: 'image/*', multiple: true, icon: SVG.photos, title: 'Add photos', sub: 'or drop them here. JPEG works best; pick many at once.', compact: W.colours.length > 0, onFiles: fs => addPhotos(fs) }));
  const selIm = state.selected && W.images[state.selected];
  if (selIm) out.push(h('div', { class: 'pbl-selbar', role: 'status' }, h('span', null, 'Moving ', h('b', null, selIm.name), '. Tap a photo spot to put it there.'), btn('Cancel', () => { state.selected = null; rerender(); }, 'pb-btn--ghost pb-btn--sm')));
  if (W.colours.length) out.push(h('div', { class: 'pbl-colours' }, W.colours.map(colourCard)));
  const tray = unplacedKeys();
  if (tray.length) out.push(trayEl(tray));
  out.push(h('div', { class: 'pbl-actions' }, btn('Add a colour by hand', () => { W.colours.push(newColour('', '', 'm' + uid())); commit(); }),
    Object.keys(W.images).length ? confirmBtn('Clear all photos', 'Tap again to clear all photos', newBatch, 'pb-btn--ghost is-danger') : null));
  out.push(cataloguesEl());
  out.push(navFooter());
  return out;
}
function shadeCard() {
  return h('div', { class: 'pbl-shades', role: 'list', 'aria-label': 'Colours in this batch' }, state.W.colours.map(col => h('div', { class: 'pbl-shade', role: 'listitem', 'data-shade': col.id },
    h('span', { class: 'pbl-shade__chip' + (swatchOf(col) ? '' : ' is-blank'), style: swatchStyle(col) }),
    h('span', { class: 'pbl-shade__name' }, col.label || 'No name yet'),
    h('span', { class: 'pbl-shade__meesho' + (col.meesho ? '' : ' is-missing') }, col.meesho || 'Meesho colour?'))));
}
function updateColourBits(col) {
  if (!els.root) return;
  const sw = swatchOf(col);
  els.root.querySelectorAll('[data-swatch="' + col.id + '"], [data-shade="' + col.id + '"] .pbl-shade__chip').forEach(el => { if (sw) el.style.setProperty('--sw', sw); else el.style.removeProperty('--sw'); el.classList.toggle('is-blank', !sw); });
  const sh = els.root.querySelector('[data-shade="' + col.id + '"]');
  if (sh) {
    sh.querySelector('.pbl-shade__name').textContent = col.label || 'No name yet';
    const m = sh.querySelector('.pbl-shade__meesho'); m.textContent = col.meesho || 'Meesho colour?'; m.classList.toggle('is-missing', !col.meesho);
  }
}
function colourCard(col) {
  const W = state.W, opts = state.tpl.schema.byRole.color.options;
  const lblId = 'pbl-lbl-' + col.id, msId = 'pbl-ms-' + col.id;
  const labelIn = input({ type: 'text', id: lblId, value: col.label, maxlength: 40, placeholder: 'Wine', autocomplete: 'off', oninput: e => {
    col.label = e.target.value;
    if (!col.meesho && opts) { const d = colourDict(opts); const guess = d[normKey(col.label)]; if (guess) { col.meesho = guess; const s = els.root.querySelector('#' + msId); if (s) s.value = guess; } }
    changed(); updateColourBits(col);
  } });
  const meeshoIn = opts
    ? selectEl(opts, col.meesho, v => { col.meesho = v; changed(); updateColourBits(col); }, 'Choose', { id: msId })
    : input({ type: 'text', id: msId, value: col.meesho, oninput: e => { col.meesho = e.target.value; changed(); updateColourBits(col); } });
  const cats = W.catalogues;
  return h('article', { class: 'pbl-card', 'aria-label': (col.label || 'Unnamed') + ' colour' },
    h('div', { class: 'pbl-card__swatch' + (swatchOf(col) ? '' : ' is-blank'), 'data-swatch': col.id, style: swatchStyle(col) }),
    h('div', { class: 'pbl-card__body' },
      h('div', { class: 'pbl-card__head' },
        h('div', { class: 'pb-field' }, h('label', { class: 'pb-field__label', for: lblId }, 'Colour name'), labelIn),
        h('div', { class: 'pb-field' }, h('label', { class: 'pb-field__label', for: msId }, 'Meesho colour'), meeshoIn),
        h('button', { type: 'button', class: 'pbl-x', 'aria-label': 'Remove ' + (col.label || 'this colour'), title: 'Remove colour (its photos go back to the tray)', onclick: () => removeColour(col.id) }, '×')),
      cats.length > 1 ? h('div', { class: 'pb-field pbl-card__cat' }, h('label', { class: 'pb-field__label', for: 'pbl-cat-' + col.id }, 'Catalogue'),
        selectEl(cats.map((c, i) => ({ value: c.id, label: catName(c, i) })), catOf(col), v => { col.cat = v; commit(); }, null, { id: 'pbl-cat-' + col.id })) : null,
      h('div', { class: 'pbl-slots' }, VIEWS.map(v => slotEl(col[v], { type: 'slot', colourId: col.id, view: v }, VIEW_LABEL[v])))));
}
function photoImg(im) { return im.thumb ? h('img', { src: im.thumb, alt: '', draggable: 'false' }) : h('span', { class: 'pbl-nothumb' }, (im.format || 'photo').toUpperCase()); }
function issueBadge(im) {
  if (im.format && im.format !== 'jpeg') return h('span', { class: 'pbl-badge', title: 'Meesho asks for JPEG photos' }, im.format.toUpperCase());
  if (im.cmyk) return h('span', { class: 'pbl-badge', title: 'Saved in CMYK colours; Meesho asks for RGB' }, 'CMYK');
  return null;
}
function dragSource(el, key) {
  el.draggable = true;
  el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', 'photo:' + key); e.dataTransfer.effectAllowed = 'move'; el.classList.add('is-dragging'); });
  el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
}
function dropTarget(el, target) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('is-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('is-over'));
  el.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation(); el.classList.remove('is-over');
    const data = e.dataTransfer.getData('text/plain') || '';
    if (data.startsWith('photo:')) { placePhoto(data.slice(6), target); state.selected = null; commit(); }
    else if (e.dataTransfer.files && e.dataTransfer.files.length) addPhotos([...e.dataTransfer.files], target);
  });
}
function onSpotClick(key, target) {
  const sel = state.selected;
  if (sel && sel !== key) { placePhoto(sel, target); state.selected = null; commit(); return; }
  if (key) { state.selected = sel === key ? null : key; rerender(); return; }
  toast('Tap a photo first, then tap this spot.');
}
function slotEl(key, target, label) {
  const im = key && state.W.images[key] ? state.W.images[key] : null;
  const sel = state.selected, isSel = !!im && sel === key;
  const b = h('button', {
    type: 'button', class: 'pbl-slot' + (im ? ' is-filled' : '') + (isSel ? ' is-selected' : '') + (sel && !isSel ? ' is-target' : ''),
    'aria-label': label + (im ? ': ' + im.name + (isSel ? ', selected' : '') : ', empty'), onclick: () => onSpotClick(key, target)
  }, im ? photoImg(im) : h('span', { class: 'pbl-slot__empty' }, sel ? 'Put here' : label), im ? h('span', { class: 'pbl-slot__tag' }, label) : null, im ? issueBadge(im) : null);
  dropTarget(b, target);
  if (im) dragSource(b, key);
  const wrap = h('div', { class: 'pbl-slot-wrap' }, b);
  if (im) wrap.append(h('button', { type: 'button', class: 'pbl-slot__x', 'aria-label': 'Take ' + im.name + ' out', title: 'Take out', onclick: () => { placePhoto(key, { type: 'tray' }); if (state.selected === key) state.selected = null; commit(); } }, '×'));
  return wrap;
}
function trayEl(keys) {
  const W = state.W;
  const tray = h('div', { class: 'pbl-tray' },
    h('div', { class: 'pbl-tray__head' }, h('h3', { class: 'pbl-h3' }, 'Not placed yet'), h('span', { class: 'fine-inline' }, plural(keys.length, 'photo'))),
    h('p', { class: 'fine' }, 'These names didn\'t say which colour they are. Tap one, then tap its spot, or turn them into colours three at a time in name order.'),
    h('div', { class: 'pbl-tray__grid' }, keys.map(k => {
      const im = W.images[k], isSel = state.selected === k;
      const b = h('button', { type: 'button', class: 'pbl-pic' + (isSel ? ' is-selected' : ''), 'aria-pressed': isSel ? 'true' : 'false', 'aria-label': im.name, onclick: () => { state.selected = isSel ? null : k; rerender(); } }, photoImg(im), issueBadge(im));
      dragSource(b, k);
      return h('div', { class: 'pbl-tphoto' }, b, h('span', { class: 'pbl-nm', title: im.name }, im.name));
    })),
    h('div', { class: 'pbl-actions' },
      btn('Make colours from these (front, back, side)', () => groupInThrees(keys)),
      btn('Remove these photos', () => removePhotos(keys), 'pb-btn--ghost is-danger')));
  dropTarget(tray, { type: 'tray' });
  return tray;
}
function cataloguesEl() {
  const W = state.W, S = state.S, many = W.catalogues.length > 1;
  const wrap = h('div', { class: 'pbl-cats' }, h('h3', { class: 'pbl-h3' }, many ? 'Catalogues' : 'Catalogue'),
    h('p', { class: 'fine' }, many ? 'Each colour card says which catalogue it goes in. Every catalogue gets its own Group ID.' : 'All the colours above go into one catalogue with one Group ID. Add another catalogue to list a second design in the same file.'),
    W.catalogues.map((cat, i) => h('div', { class: 'pbl-cat' },
      h('div', { class: 'pbl-cat__cover' }, slotEl(cat.cover, { type: 'cover', catId: cat.id }, 'Collage')),
      h('div', { class: 'pbl-grid' },
        field('Name or code', input({ type: 'text', value: cat.name, maxlength: 20, placeholder: i === 0 ? 'STRIP' : 'Design ' + (i + 1), autocomplete: 'off', oninput: e => { cat.name = e.target.value; changed(); } }), { hint: 'Goes into Style IDs and SKUs.' }),
        many ? field('Product name', input({ type: 'text', value: cat.productName, maxlength: 200, placeholder: S.productName || '', oninput: e => { cat.productName = e.target.value; changed(); } }), { hint: 'Empty uses the name from Details.' }) : null,
        field('Meesho price (₹)', input({ type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: cat.price, placeholder: S.price || '', oninput: e => { cat.price = e.target.value; changed(); } }), { hint: 'Empty uses Details.' }),
        field('MRP (₹)', input({ type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: cat.mrp, placeholder: S.mrp || '', oninput: e => { cat.mrp = e.target.value; changed(); } }), { hint: 'Empty uses Details.' })),
      many ? h('button', { type: 'button', class: 'pbl-x', 'aria-label': 'Remove ' + catName(cat, i).toLowerCase(), title: 'Remove catalogue (its colours move to the first one)', onclick: () => {
        const first = W.catalogues.find(c => c.id !== cat.id);
        W.colours.forEach(c => { if (catOf(c) === cat.id) c.cat = first.id; });
        W.catalogues = W.catalogues.filter(c => c.id !== cat.id); commit();
      } }, '×') : null)),
    h('div', { class: 'pbl-actions' }, btn('Add another catalogue', () => { W.catalogues.push(newCatalogue()); commit(); })));
  if (W.catalogues.some(c => c.cover)) {
    wrap.append(h('div', { class: 'pbl-placement' }, field('Where the collage goes', selectEl([{ value: 'last', label: 'After each colour\'s own photos' }, { value: 'first', label: 'First, as Image 1' }, { value: 'none', label: 'Leave it out' }], S.placement, v => { S.placement = v; commit(); }),
      { hint: 'Meesho\'s Image 1 is the front photo, so after the colour\'s own photos is the safer spot.' })));
  }
  return wrap;
}

/* ---- step 5 */
function linkStatus(im) {
  if (!im.link) return h('span', { class: 'pill pill--due' }, 'Needs a link');
  if (im.how === 'order') return h('span', { class: 'pill pbl-pill-order' }, 'By order, check it');
  if (im.how === 'hand') return h('span', { class: 'pill pill--paid' }, 'Added by you');
  return h('span', { class: 'pill pill--paid' }, 'Matched');
}
function renderLinks() {
  const W = state.W, used = usedPhotoKeys();
  if (!used.length) return [...title('Image links', 'Meesho\'s sheet takes a web link for each photo instead of the photo itself. Place your photos first.'), navFooter()];
  const missing = used.filter(k => !W.images[k].link);
  const out = title('Image links', 'Meesho\'s sheet takes a web link for each photo, not the photo itself. Upload these ' + plural(used.length, 'photo') + ' in the supplier panel\'s Images Bulk Upload, copy the links it gives you and paste them here.');
  out.push(banner('info', 'Use the links from Images Bulk Upload. Meesho rejects Google Drive links.'));
  const ta = textarea({ id: 'pbl-linkPaste', rows: 4, placeholder: 'Paste the links here. File names on the same line help match them.', 'aria-label': 'Links from Meesho' });
  out.push(h('div', { class: 'pbl-paste' }, ta), h('div', { class: 'pbl-actions' },
    btn('Match links', () => onMatchLinks(ta.value), 'pb-btn--primary'),
    fileBtn('Use a links file', '.xlsx,.csv,.txt', onLinksFile),
    Object.values(W.images).some(i => i.link) ? confirmBtn('Clear all links', 'Tap again to clear links', clearLinks, 'pb-btn--ghost is-danger') : null));
  const n = state.linkNote;
  if (n) out.push(banner(n.missing ? 'warn' : 'ok', 'Matched ' + n.matched + ' of ' + plural(n.total, 'link') + ' by file name.' + (n.missing ? ' ' + plural(n.missing, 'photo') + ' still ' + (n.missing === 1 ? 'needs' : 'need') + ' a link.' : ' Every photo has its link.')));
  if (W.pendingLinks.length && missing.length) {
    const k = Math.min(W.pendingLinks.length, missing.length);
    out.push(banner('warn', h('span', null, plural(W.pendingLinks.length, 'link') + (W.pendingLinks.length === 1 ? ' doesn\'t' : ' don\'t') + ' name a photo. If you uploaded the photos in the order listed below (A to Z by file name), they can be matched in that order.'),
      btn('Match ' + k + ' by order', onMatchByOrder, 'pb-btn--secondary pb-btn--sm')));
  }
  out.push(h('div', { class: 'table-wrap' }, h('table', { class: 'rtable pbl-links' },
    h('thead', null, h('tr', null, h('th', { class: 'l', scope: 'col' }, '#'), h('th', { class: 'l', scope: 'col' }, 'Photo'), h('th', { class: 'l', scope: 'col' }, 'Link'), h('th', { class: 'l', scope: 'col' }, 'Status'))),
    h('tbody', null, used.map((k, i) => {
      const im = W.images[k];
      const st = h('td', { class: 'l pbl-st' }, linkStatus(im));
      return h('tr', null,
        h('td', { class: 'l pbl-num' }, String(i + 1)),
        h('td', { class: 'l' }, h('div', { class: 'pbl-ph' }, photoImg(im), h('div', null, h('div', { class: 'pbl-ph__name' }, im.name), h('div', { class: 'pbl-ph__where' }, placeOf(k))))),
        h('td', { class: 'l' }, input({ type: 'url', value: im.link || '', placeholder: 'https://', 'aria-label': 'Link for ' + im.name, oninput: e => { im.link = e.target.value.trim(); im.how = im.link ? 'hand' : ''; changed(); st.replaceChildren(linkStatus(im)); } }),
          im.link && /^https?:\/\//i.test(im.link) ? h('a', { class: 'text-link pbl-open', href: im.link, target: '_blank', rel: 'noopener noreferrer' }, 'Open to check') : null),
        st);
    })))));
  out.push(navFooter());
  return out;
}

/* ---- step 6 */
function renderDownload() {
  const plan = currentPlan(), c = plan.counts;
  const errors = plan.issues.filter(i => i.level === 'error'), warns = plan.issues.filter(i => i.level === 'warn');
  const out = [h('h2', { class: 'form-sec__title' }, 'Download Excel')];
  if (!errors.length && c.rows) {
    out.push(h('p', { class: 'pbl-summary' }, plural(c.rows, 'row') + ' ready: ' + plural(c.products, 'colour') + ' in ' + plural(c.sizes, 'size') + (c.catalogues > 1 ? ', across ' + c.catalogues + ' catalogues' : '') + '.'));
    out.push(h('div', { class: 'pbl-actions' }, plan.parts.map((p, i) => h('button', { type: 'button', class: 'pb-btn pb-btn--primary pbl-big', onclick: () => downloadPart(plan, i) }, svgEl(SVG.dl), plan.parts.length > 1 ? 'Download file ' + (i + 1) + ' of ' + plan.parts.length : 'Download Excel'))));
    out.push(h('p', { class: 'fine' }, 'Upload it on the same Meesho page where you downloaded the template. Only the rows change; the instructions, dropdowns and other sheets stay as Meesho made them.'));
  } else {
    out.push(h('p', { class: 'pbl-summary' }, errors.length ? plural(errors.length, 'thing') + ' to fix before downloading' : 'Nothing to download yet'));
  }
  const list = (items, level) => h('ul', { class: 'pbl-issues' }, items.slice(0, 14).map(i => h('li', { class: 'is-' + level }, h('span', null, i.msg), btn(STEP_TITLE[i.where], () => go(i.where), 'pb-btn--ghost pb-btn--sm'))),
    items.length > 14 ? h('li', { class: 'is-more' }, 'and ' + (items.length - 14) + ' more') : null);
  if (errors.length) out.push(list(errors, 'error'));
  if (warns.length) out.push(h('h3', { class: 'pbl-h3' }, 'Worth a look'), list(warns, 'warn'));
  if (c.rows) {
    const rows = plan.parts.flatMap(p => p.rows);
    out.push(h('h3', { class: 'pbl-h3' }, 'What goes in the sheet'), h('div', { class: 'table-wrap pbl-preview' }, h('table', { class: 'rtable' },
      h('thead', null, h('tr', null, ['Group', 'Colour', 'Meesho colour', 'Size', 'Product name'].map(t => h('th', { class: 'l', scope: 'col' }, t)), ['Price', 'MRP'].map(t => h('th', { scope: 'col' }, t)), h('th', { class: 'l', scope: 'col' }, 'SKU'), h('th', { scope: 'col' }, 'Photos'))),
      h('tbody', null, rows.slice(0, 120).map(r => { const m = r.meta; return h('tr', null, h('td', { class: 'l' }, m.group), h('td', { class: 'l' }, m.colour), h('td', { class: 'l' }, m.meesho), h('td', { class: 'l' }, m.size), h('td', { class: 'l' }, m.name), h('td', null, '₹' + fmt(m.price)), h('td', null, '₹' + fmt(m.mrp)), h('td', { class: 'l' }, m.sku), h('td', null, String(m.photos))); })))));
    if (rows.length > 120) out.push(h('p', { class: 'fine' }, 'Showing the first 120 of ' + rows.length + ' rows.'));
  }
  if (state.downloaded) out.push(h('div', { class: 'pbl-next' }, h('p', null, 'Listing another design? Start a new batch. Your template, details and sizes stay.'), confirmBtn('Start a new batch', 'Tap again to clear this batch', newBatch, 'pb-btn--primary')));
  out.push(navFooter());
  return out;
}

/* ---------------------------------------------------------------- mount */

function firstOpenStep() {
  const plan = currentPlan();
  const has = where => plan.issues.some(i => i.level === 'error' && i.where === where);
  if (has('details')) return 'details';
  if (has('sizes')) return 'sizes';
  if (!Object.keys(state.W.images).length || has('photos')) return 'photos';
  if (has('links')) return 'links';
  return 'download';
}
async function loadSaved() {
  state.S = loadSettings();
  downloadsCap();
  try {
    const w = await idbGet('work');
    if (w && typeof w === 'object') state.W = normalizeWork(w);
    const t = await idbGet('template');
    if (t && t.bytes) { await applyTemplate(t.bytes, t.name, true); state.step = firstOpenStep(); }
  } catch (e) { /* nothing saved yet, or storage is off */ }
  await applyShopDefaults();
}
/** Called by PakkaBill each time the Meesho listing page opens. */
function mount(el) {
  if (!document.getElementById('pbl-css')) document.head.append(h('style', { id: 'pbl-css' }, PBL_CSS));
  els.pill = h('span', { class: 'pill pill--void' }, 'No template yet');
  els.steps = h('ol', { class: 'pbl-steps', 'aria-label': 'Listing steps' });
  els.panel = h('section', { class: 'paper pbl-panel' });
  els.root = h('div', { class: 'pbl' },
    h('div', { class: 'page-head' },
      h('div', null, h('h1', { class: 'page-title' }, 'Meesho listing'), h('p', { class: 'page-sub' }, 'Turn catalogue photos into Meesho\'s bulk-upload Excel.')),
      els.pill),
    els.steps, els.panel);
  el.replaceChildren(els.root);
  if (!state.loaded) {
    els.panel.append(h('p', { class: 'pbl-empty' }, 'Opening your listing tool…'));
    state.loaded = loadSaved().catch(() => {});
  }
  state.loaded.then(() => { if (els.root && els.root.isConnected && els.root.parentNode === el) renderAll(); });
}

    return { mount };
  }

  window.pbListingMount = function (el) {
    if (!el || el.__pblMounted) return;
    el.__pblMounted = true;
    try {
      if (!app) app = start();
      app.mount(el);
    } catch (e) {
      var b = document.createElement('div');
      b.className = 'banner banner--warn';
      b.textContent = 'The Meesho listing tool could not start: ' + (e && e.message ? e.message : e) + '. Reload PakkaBill and try again.';
      el.replaceChildren ? el.replaceChildren(b) : (el.innerHTML = '', el.appendChild(b));
    }
  };
})();
