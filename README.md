# RDF Writer for TypeScript

[![CI](https://github.com/pietercolpaert/rdf-writer-ts/actions/workflows/test.yml/badge.svg)](https://github.com/pietercolpaert/rdf-writer-ts/actions/workflows/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/pietercolpaert/rdf-writer-ts/badge.svg?branch=main)](https://coveralls.io/github/pietercolpaert/rdf-writer-ts?branch=main)
[![npm version](https://img.shields.io/npm/v/rdf-writer-ts.svg)](https://www.npmjs.com/package/rdf-writer-ts)

RDF/JS writer for Turtle, TriG, N-Triples, N-Quads, RDF 1.2 triple terms, and RDF Message Logs.

Its sibling package [rdf-parser-ts](https://github.com/pietercolpaert/rdf-parser-ts) parses these formats. The round-trip tests of this package write data, parse it back with `rdf-parser-ts`, and check that the result is the same graph.

## At a glance

| | |
| --- | --- |
| Throughput vs. N3.js | 1.3× for TriG, 0.8× for N-Quads |
| Browser bundle | 8.9 KiB minified, 3.2 KiB gzipped for `Writer`; `StreamWriter` adds readable-stream (125 KiB minified in total) |
| N3.js writer tests | 4,561 cases replayed, and its other writer tests ported |
| Round trips | Output parsed back with rdf-parser-ts in all four formats and in RDF Messages |
| Test coverage | 100% |

Throughput is measured by writing 100,000 generated quads with IRIs, literals of all kinds, blank nodes, named graphs, and triple terms, with prefixes, to an output stream that discards the text (median of five runs, Node.js v25.9.0, Intel Core i7-1265U). Reproduce it with `npm run perf`. Bundle sizes are for an esbuild bundle of `import { Writer } from 'rdf-writer-ts'`.

> [!NOTE]
> This package follows familiar RDF/JS and N3.js-style APIs while keeping the implementation compact. It would not have been possible without the RDF tooling ecosystem, especially Blake Regalia’s work on Graphy and Ruben Verborgh’s work on N3.js.

## Install

```sh
npm install rdf-writer-ts
```

Node.js 22 or newer is required. The writer works on any [RDF/JS](https://rdf.js.org/data-model-spec/) terms, for instance from [rdf-data-factory](https://github.com/rubensworks/rdf-data-factory.js) or from `rdf-parser-ts`.

## Usage

```ts
import { DataFactory } from 'rdf-data-factory';
import { Writer } from 'rdf-writer-ts';

const df = new DataFactory();
const writer = new Writer({ prefixes: { ex: 'https://example.org/' } });

writer.addQuad(df.quad(
	df.namedNode('https://example.org/s'),
	df.namedNode('https://example.org/p'),
	df.literal('object'),
));

writer.end((error, output) => {
	if (error) throw error;
	console.log(output);
	// @prefix ex: <https://example.org/>.
	//
	// ex:s ex:p "object".
});
```

`Writer` writes Turtle, or TriG when quads have a named graph. Use `format: 'N-Triples'` or `format: 'N-Quads'` for one statement per line:

```ts
const lines = new Writer({ format: 'N-Quads' });
lines.addQuad(df.quad(
	df.namedNode('https://example.org/s'),
	df.namedNode('https://example.org/p'),
	df.literal('42', df.namedNode('http://www.w3.org/2001/XMLSchema#integer')),
	df.namedNode('https://example.org/g'),
));
lines.end((error, output) => console.log(output));
// <https://example.org/s> <https://example.org/p> "42"^^<http://www.w3.org/2001/XMLSchema#integer> <https://example.org/g> .
```

### What is written

- **Turtle and TriG:**
  - Statements with the same subject and predicate are grouped with `;` and `,`, and named graphs become graph blocks.
  - Declared prefixes are used for prefixed names (the first declared prefix that fits, as in N3.js), and `rdf:type` is written as `a`.
  - With `baseIRI`, other IRIs are shortened to the shortest relative IRI that resolves back to exactly the same IRI, such as `<>`, `<#me>`, `<?q>`, or `<../other>`.
  - Numbers and booleans are written without quotes when their value is valid for their datatype.
  - Blank node property lists (`[ … ]`) and RDF lists (`( … )`) can be built with `blank()` and `list()`.
- **N-Triples and N-Quads:** one statement per line, without prefixes or abbreviations.
- **Literals:** language tags, RDF 1.2 base directions (`"…"@ar--rtl`), and datatypes.
- **Escapes:** quotes, backslashes, and control characters, and, as N3.js does, characters outside the Basic Multilingual Plane in IRIs and literals (`\U0001f600`).
- **RDF 1.2 triple terms** as objects (`<<( s p o )>>`). A triple term as subject, or one with a graph, is reported as an error, since RDF 1.2 does not allow them.
- **Variables** as `?name`.
- **RDF Message Logs**, with `VERSION "1.2-messages"` and `MESSAGE` in line formats, or `@version` and `@message .` in Turtle and TriG.

A term that cannot be written in its position, such as a literal as subject, is reported through the callback of `addQuad()`.

## API and types

```ts
import type * as RDF from '@rdfjs/types';

class Writer {
	/** Collects the output and passes it to the end() callback. */
	constructor(options?: WriterOptions);
	/** Writes chunks to outputStream as they are produced. */
	constructor(outputStream: WriterOutputStream, options?: WriterOptions);

	addQuad(quad: RDF.BaseQuad | MessageQuad, done?: WriterCallback): void;
	addQuad(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term, graph?: RDF.Term, done?: WriterCallback): void;
	addQuads(quads: Iterable<RDF.BaseQuad | MessageQuad>): void;
	/** Writes one RDF Message; an empty iterable writes an empty message. */
	addMessage(message: Iterable<RDF.BaseQuad>, done?: WriterCallback): void;
	/** Ignored in N-Triples/N-Quads output. */
	addPrefix(prefix: string, iri: string | RDF.NamedNode, done?: WriterCallback): void;
	addPrefixes(prefixes: Record<string, string | RDF.NamedNode>, done?: WriterCallback): void;

	/** A blank node property list to use as an object: [], [ p o ], or [ p1 o1; p2 o2 ]. */
	blank(): RDF.BlankNode;
	blank(predicate: RDF.Term, object: RDF.Term): RDF.BlankNode;
	blank(child: WriterBlankChild): RDF.BlankNode;
	blank(children: WriterBlankChild[]): RDF.BlankNode;
	/** An RDF list to use as an object: ( o1 o2 ). */
	list(elements?: RDF.Term[]): RDF.BlankNode;

	/** Serializes in N-Quads syntax without writing. */
	quadToString(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term, graph?: RDF.Term): string;
	quadsToString(quads: Iterable<RDF.BaseQuad>): string;

	/** Closes the open statement and the output. */
	end(done?: WriterEndCallback): void;
}

/** Node.js-style Transform stream (readable-stream): quads or MessageQuads in, text out. */
class StreamWriter extends Transform {
	constructor(options?: WriterOptions);
	/** Writes the quads of a stream, taking over its 'prefix' events and forwarding its errors. */
	import(stream: Readable | NodeJS.ReadableStream): this;
}

interface WriterOptions {
	/** N-Triples/N-Quads for line output; anything else writes Turtle/TriG */
	format?: string;
	prefixes?: Record<string, string | RDF.NamedNode>;
	/** Shortens IRIs in Turtle/TriG output; no @base is written, so readers need the same base IRI */
	baseIRI?: string;
	/** With an output stream: whether end() also ends it (default true) */
	end?: boolean;
	/** RDF lists to write in ( … ) syntax, keyed by the label of the blank node heading each list */
	lists?: Record<string, RDF.Term[]>;
	rdfMessages?: boolean;
	messages?: boolean;
	/** A *-messages label enables RDF Messages and is written in the version directive */
	version?: string;
}

interface MessageQuad {
	quad: RDF.BaseQuad;
	messageCounter: number;
}
interface WriterBlankChild {
	predicate: RDF.Term;
	object: RDF.Term;
}
interface WriterOutputStream {
	write: (chunk: string, encoding?: BufferEncoding, callback?: (error?: Error | null) => void) => unknown;
	end: (callback?: (error?: Error | null, result?: string) => void) => unknown;
}
type WriterCallback = (error?: Error | null) => void;
type WriterEndCallback = (error?: Error | null, output?: string) => void;
```

### Blank node property lists and lists

```ts
const knows = df.namedNode('https://example.org/knows');
const alice = df.namedNode('https://example.org/alice');
const me = df.namedNode('https://example.org/me');

writer.addQuad(me, knows, writer.blank(knows, alice));
writer.addQuad(me, df.namedNode('https://example.org/items'), writer.list([ alice, df.literal('label') ]));
// ex:me ex:knows [ ex:knows ex:alice ];
//     ex:items (ex:alice "label").
```

### Output streams

Pass an object with `write()` and `end()` methods to receive chunks as they are produced:

```ts
let output = '';
const streaming = new Writer({
	write: (chunk, _encoding, callback) => {
		output += chunk;
		callback?.(null);
	},
	end: callback => callback?.(null),
}, { end: false });
```

## StreamWriter

`StreamWriter` is a Node.js `Transform` stream, built on [readable-stream](https://github.com/nodejs/readable-stream) so it also works when bundled for browsers. It accepts RDF/JS quads or `{ quad, messageCounter }` entries in object mode and emits text. Combined with the `StreamParser` of `rdf-parser-ts`, it converts between formats:

```ts
import { createReadStream } from 'node:fs';
import { StreamParser } from 'rdf-parser-ts';
import { StreamWriter } from 'rdf-writer-ts';

new StreamWriter({ format: 'N-Quads' })
	.import(createReadStream('data.ttl').pipe(new StreamParser({ format: 'text/turtle' })))
	.pipe(process.stdout);
```

`import()` mirrors N3.js: it also takes over the `prefix` events of the parser, so Turtle output keeps the prefixes of the input.

## RDF Messages

RDF Messages are written either from `{ quad, messageCounter }` entries, as the parsers of `rdf-parser-ts` produce them, or one message at a time with `addMessage()`:

```ts
const log = new Writer({ format: 'N-Quads' });
log.addMessage([ df.quad(df.namedNode('https://example.org/s1'), df.namedNode('https://example.org/p'), df.literal('1')) ]);
log.addMessage([]);
log.addMessage([ df.quad(df.namedNode('https://example.org/s2'), df.namedNode('https://example.org/p'), df.literal('2')) ]);
log.end((error, output) => console.log(output));
// VERSION "1.2-messages"
// <https://example.org/s1> <https://example.org/p> "1" .
// MESSAGE
// MESSAGE
// <https://example.org/s2> <https://example.org/p> "2" .
```

Gaps in `messageCounter` values are written as empty messages.

## Development

```sh
npm run build      # Build CommonJS, ESM, and declaration files
npm run typecheck  # Type-check with tsc --noEmit
npm run lint       # Lint with @rubensworks/eslint-config
npm test           # Run unit tests; fails below 100% coverage
npm run check      # Type-check, lint, build, then test
npm run perf       # Benchmark against N3.js
```

### Test suites

- `test/n3-compat.test.ts` runs the writer tests of [N3.js](https://github.com/rdfjs/N3.js): 49 serialization cases and 4,512 IRI relativization cases replayed from `test/fixtures/n3-writer-cases.json`, and its other writer and stream writer tests, ported. Every relativized IRI is also parsed back with `rdf-parser-ts`. Where this writer deliberately differs from N3.js, the test says why: it rejects triple terms as subjects and triple terms with a graph, which RDF 1.2 does not allow, and it keeps an IRI such as `a:bc` an IRI instead of writing it as a prefixed name. To regenerate the fixture from an N3.js checkout that has been built, run `npm run test:n3-extract -- ../N3.js`.
- `test/roundtrip.test.ts` writes a dataset with literals of all kinds, blank nodes, triple terms, named graphs, and escapes in all four formats, and in RDF Messages, and parses the output back with `rdf-parser-ts`. It also checks, for a table of IRIs and base IRIs, that every shortened IRI resolves back to the original.

## License

© Ghent University - IMEC

MIT Licensed
