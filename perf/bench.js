#!/usr/bin/env node
'use strict';

/**
 * Writes the same generated quads with rdf-writer-ts and N3.js, in N-Quads and in TriG, to an output stream that
 * discards the text, and reports the median throughput of several runs.
 *
 * Usage: npm run build && node perf/bench.js [--sizes 10000,100000] [--runs 5]
 */

const { DataFactory } = require('rdf-data-factory');
const { Writer: N3Writer } = require('n3');
const { Writer } = require('../dist');

const df = new DataFactory();
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const EX = 'http://example.org/';

function parseArgs(argv) {
  const args = { sizes: [ 10_000, 100_000 ], runs: 5 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sizes') {
      args.sizes = argv[++i].split(',').map(Number);
    } else if (argv[i] === '--runs') {
      args.runs = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

/** Quads with grouped subjects, IRIs, plain, language-tagged, numeric and boolean literals, blank nodes, graphs, and triple terms */
function generateQuads(count, withGraphs) {
  const quads = [];
  const types = df.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
  for (let i = 0; i < count; i++) {
    const subject = df.namedNode(`${EX}s${Math.floor(i / 5)}`);
    const graph = withGraphs && i % 3 === 0 ? df.namedNode(`${EX}g${i % 10}`) : df.defaultGraph();
    let predicate = df.namedNode(`${EX}p${i % 7}`);
    let object;
    switch (i % 8) {
      case 0: predicate = types; object = df.namedNode(`${EX}Class${i % 4}`); break;
      case 1: object = df.literal(`value ${i} with "quotes"`); break;
      case 2: object = df.literal(`label ${i}`, 'en'); break;
      case 3: object = df.literal(String(i), df.namedNode(`${XSD}integer`)); break;
      case 4: object = df.literal(i % 2 ? 'true' : 'false', df.namedNode(`${XSD}boolean`)); break;
      case 5: object = df.blankNode(`b${i}`); break;
      case 6: object = df.quad(df.namedNode(`${EX}a${i}`), df.namedNode(`${EX}knows`), df.namedNode(`${EX}b${i}`)); break;
      default: object = df.namedNode(`${EX}o${i}`);
    }
    quads.push(df.quad(subject, predicate, object, graph));
  }
  return quads;
}

/** Writes all quads to an output stream that only counts the characters, and returns that count. */
function write(WriterClass, quads, format) {
  let length = 0;
  const writer = new WriterClass({
    write(chunk, _encoding, callback) {
      length += chunk.length;
      if (callback) {
        callback();
      }
    },
    end(callback) {
      if (callback) {
        callback();
      }
    },
  }, { format, prefixes: { ex: EX, xsd: XSD }});
  for (const quad of quads) {
    writer.addQuad(quad);
  }
  writer.end();
  return length;
}

function median(values) {
  const sorted = [ ...values ].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('     size  format    writer          median time      throughput');
  for (const size of args.sizes) {
    for (const format of [ 'N-Quads', 'TriG' ]) {
      const quads = generateQuads(size, true);
      for (const [ label, WriterClass ] of [[ 'rdf-writer-ts', Writer ], [ 'N3.js', N3Writer ]]) {
        write(WriterClass, quads.slice(0, 1000), format);
        const times = [];
        for (let run = 0; run < args.runs; run++) {
          if (global.gc) {
            global.gc();
          }
          const start = process.hrtime.bigint();
          write(WriterClass, quads, format);
          times.push(Number(process.hrtime.bigint() - start) / 1e9);
        }
        const time = median(times);
        console.log([
          String(size).padStart(9),
          format.padEnd(8),
          label.padEnd(14),
          `${time.toFixed(3)}s`.padStart(12),
          `${Math.round(size / time).toLocaleString('en-US')} q/s`.padStart(16),
        ].join('  '));
      }
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateQuads };
