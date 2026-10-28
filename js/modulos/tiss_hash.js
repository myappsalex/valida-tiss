// js/modulos/tiss_hash.js – hash do epílogo TISS no navegador (para recalcular após edições).
// Mesma regra de vt_core/tiss.py (MD5 dos textos fora do epílogo, em ISO-8859-1).
// ATENÇÃO: valide com um arquivo aceito pela operadora antes de gravar o hash automaticamente.
'use strict';

function md5Latin1(str) {   // MD5 puro (crypto.subtle não oferece MD5). Entrada: string; chars > 0xFF viram '?'
    const b = []; for (const ch of str) { const c = ch.codePointAt(0); b.push(c > 255 ? 63 : c); }
    const K = new Uint32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    const n = b.length; b.push(0x80); while (b.length % 64 !== 56) b.push(0);
    const bits = n * 8; for (let i = 0; i < 8; i++) b.push(i < 4 ? (bits >>> (8 * i)) & 255 : Math.floor(n / 536870912) >>> (8 * (i - 4)) & 255);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const rotl = (x, c) => (x << c) | (x >>> (32 - c));
    for (let o = 0; o < b.length; o += 64) {
        const M = new Uint32Array(16); for (let i = 0; i < 16; i++) M[i] = b[o + 4 * i] | b[o + 4 * i + 1] << 8 | b[o + 4 * i + 2] << 16 | b[o + 4 * i + 3] << 24;
        let A = a0, B = b0, C = c0, D = d0;
        for (let i = 0; i < 64; i++) {
            let F, g;
            if (i < 16) { F = (B & C) | (~B & D); g = i; }
            else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
            else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
            else { F = C ^ (B | ~D); g = (7 * i) % 16; }
            F = (F + A + K[i] + M[g]) >>> 0; A = D; D = C; C = B;
            B = (B + rotl(F, S[(i >> 4) * 4 + (i % 4)])) >>> 0;
        }
        a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    return [a0, b0, c0, d0].map(v => [0, 8, 16, 24].map(s => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
}

/** raiz: Element raiz (mensagemTISS). Retorna o hash hexadecimal minúsculo. */
function calcularHashTISS(raiz) {
    let txt = '';
    for (const filho of raiz.children) {
        if (filho.localName === 'epilogo') continue;
        const it = document.createNodeIterator ? null : null; void it;
        const pilha = [filho];
        while (pilha.length) {            // ordem de documento (pré-ordem)
            const e = pilha.pop();
            for (const n of e.childNodes) if (n.nodeType === 3 && e.children.length === 0 && n.nodeValue.trim()) txt += n.nodeValue;
            for (let i = e.children.length - 1; i >= 0; i--) pilha.push(e.children[i]);
        }
    }
    return md5Latin1(txt);
}
if (typeof module !== 'undefined') module.exports = { md5Latin1, calcularHashTISS };
