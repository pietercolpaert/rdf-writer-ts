# rdf-writer.ts

Fast RDF-JS writer for Turtle, TriG, N-Triples, N-Quads, RDF 1.2 triple terms, and RDF Message Logs in Node.js.

This package contains the writer that used to live next to `rdf-parser.ts`. It is now published separately so parser and writer users can depend on only the package they need.

> [!NOTE]
> This package follows familiar RDF-JS and N3.js-style APIs while keeping the implementation compact. It would not have been possible without the RDF tooling ecosystem, especially Blake Regalia’s work on Graphy and Ruben Verborgh’s work on N3.js.

## Supported output

- Turtle-style compact output with subject/predicate grouping.
- TriG graph blocks for named graphs.
- N-Triples and N-Quads line formats through the `format` option.
- Prefix declarations, prefixed names, `a` for `rdf:type`, and base IRI shortening in pretty formats.
- RDF-JS named nodes, blank nodes, literals, variables, default graphs, and quads.
- Language and direction literals, explicit datatype literals, numeric/boolean abbreviations, escaped IRIs/literals, blank-node property lists, RDF lists, and RDF 1.2 triple terms.
- RDF Message Logs through `VERSION "...-messages"`, `MESSAGE`, `@version`, and `@message .` delimiters.
- String output, supplied output streams, and Node.js object-mode transform streams.

## Install

```sh
npm install rdf-writer-ts
```

Node.js 24 or newer is required.

For local development:

```sh
npm install
npm run build
npm test
```

## Build and validation scripts

```sh
npm run build  # Build CommonJS, ESM, and declaration files
npm run lint   # Type-check with tsc --noEmit
npm test       # Run unit tests
npm run check  # Type-check, build, then test
```

The writer currently ships unit tests for serialization behavior. Unlike the parser package, this repository does not yet ship an official RDF Working Group compliance badge or a dedicated N3.js/Graphy writer benchmark. Parser compliance and parser performance comparisons live in `rdf-parser.ts`.

## Basic usage

```ts
import { DataFactory, Writer } from 'rdf-writer.ts';

const { namedNode, literal, quad } = DataFactory;

const writer = new Writer({ prefixes: { ex: 'https://example.org/' } });
writer.addQuad(quad(
  namedNode('https://example.org/s'),
  namedNode('https://example.org/p'),
  literal('object'),
));

writer.end((error, output) => {
  if (error) throw error;
  console.log(output);
  // @prefix ex: <https://example.org/>.
  //
  // ex:s ex:p "object".
});
```

`Writer` writes Turtle/TriG-style output by default. Use `format: 'N-Triples'` or `format: 'N-Quads'` for line-based output.

```ts
const writer = new Writer({ format: 'N-Quads' });
writer.addQuad(quad(
  namedNode('https://example.org/s'),
  namedNode('https://example.org/p'),
  literal('42', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
  namedNode('https://example.org/g'),
));

writer.end((error, output) => {
  if (error) throw error;
  console.log(output);
  // <https://example.org/s> <https://example.org/p> "42"^^<http://www.w3.org/2001/XMLSchema#integer> <https://example.org/g> .
});
```

## Writer API

### `new Writer(options)` / `new Writer(outputStream, options)`

Construct a writer that either collects output into a final string or writes chunks to a supplied stream-like object.

Options:

- `format`: output format hint. N-Triples/N-Quads values enable one-statement-per-line mode; other values use Turtle/TriG-style pretty output.
- `prefixes`: map from prefix labels to IRI strings or named nodes. Prefixes are emitted in pretty formats and ignored in line formats.
- `baseIRI`: base IRI used to shorten matching named nodes in pretty formats.
- `end`: when an output stream is supplied, controls whether `Writer#end()` calls the stream's `end()` method. Defaults to `true`.
- `lists`: map blank node labels to RDF list contents for pretty-printing list heads.
- `rdfMessages` / `messages`: force RDF Messages output.
- `version`: set the RDF version label; messages versions such as `1.2-messages` enable RDF Messages output.

### `quadToString(subject, predicate, object, graph?)`

Serializes a single quad in line syntax and returns the string. This is useful for diagnostics and simple line-format output.

```ts
const line = new Writer().quadToString(namedNode('s'), namedNode('p'), namedNode('o'));
console.log(line); // <s> <p> <o> .
```

### `quadsToString(quads)`

Serializes an iterable of RDF-JS quads in line syntax and returns one concatenated string.

### `addQuad()` and `addQuads()`

`addQuad()` accepts either a full RDF-JS quad, separated `subject`, `predicate`, `object`, optional `graph` terms, or an RDF Messages entry of the shape `{ quad, messageCounter }`. `addQuads()` iterates over an iterable of quads or message entries.

```ts
writer.addQuad(quad(namedNode('s'), namedNode('p'), namedNode('o')));
writer.addQuad(namedNode('s'), namedNode('p'), literal('second'));
writer.addQuads([quad(namedNode('s'), namedNode('p'), namedNode('third'))]);
```

### `addPrefix()` and `addPrefixes()`

Adds prefix declarations in pretty formats. If writing has already started, the current statement is closed before the prefix declaration is emitted.

```ts
writer.addPrefix('ex', 'https://example.org/');
writer.addPrefixes({ foaf: 'http://xmlns.com/foaf/0.1/' });
```

### `blank()` and `list()`

Creates serialized terms for Turtle blank-node property lists and RDF lists.

```ts
const knows = namedNode('https://example.org/knows');
const alice = namedNode('https://example.org/alice');

writer.addQuad(namedNode('https://example.org/me'), knows, writer.blank(knows, alice));
writer.addQuad(namedNode('https://example.org/me'), namedNode('https://example.org/items'), writer.list([alice, literal('label')]));
```

`blank()` accepts no arguments for `[]`, a single `{ predicate, object }` child, an array of children, or shorthand `blank(predicate, object)`.

### `addMessage()`

Writes one RDF Message from an iterable of quads. Empty iterables preserve empty messages.

```ts
const writer = new Writer({ prefixes: { ex: 'http://example.org/' }, version: '1.2-messages' });

writer.addMessage([
  quad(namedNode('http://example.org/s1'), namedNode('http://example.org/p'), namedNode('http://example.org/o1')),
]);
writer.addMessage([]);
writer.addMessage([
  quad(namedNode('http://example.org/s2'), namedNode('http://example.org/p'), namedNode('http://example.org/o2')),
]);

writer.end((error, serialized) => {
  if (error) throw error;
  console.log(serialized);
});
```

### `end(callback)`

Closes any open statement and finalizes the writer. When no output stream is supplied, the callback receives the complete serialized string as its second argument. Writing after `end()` reports an error through the write callback.

## Output streams

Pass a stream-like object with `write()` and `end()` methods when you want chunks as they are produced.

```ts
let output = '';
const writer = new Writer({
  write: (chunk, _encoding, callback) => {
    output += chunk;
    callback?.(null);
  },
  end: callback => callback?.(null),
}, { end: false });

writer.addQuad(quad(namedNode('s'), namedNode('p'), namedNode('o')));
writer.end(error => {
  if (error) throw error;
  console.log(output);
});
```

## StreamWriter

`StreamWriter` is a Node.js `Transform` stream in object mode. It accepts RDF-JS quads or `{ quad, messageCounter }` entries and emits serialized text chunks.

```ts
import { Readable } from 'node:stream';
import { DataFactory, StreamWriter } from 'rdf-writer.ts';

const { namedNode, quad } = DataFactory;

Readable.from([
  quad(namedNode('a'), namedNode('b'), namedNode('c')),
  quad(namedNode('a'), namedNode('b'), namedNode('d')),
], { objectMode: true })
  .pipe(new StreamWriter())
  .pipe(process.stdout);
```

The `import()` convenience method mirrors N3.js and forwards `prefix` events from an input stream:

```ts
const writer = new StreamWriter({ format: 'N-Quads' });
writer.import(quadStream).pipe(process.stdout);
```

## RDF Messages

RDF Messages can be written either by adding message entries directly or by calling `addMessage()`.

```ts
import { DataFactory, Writer, type MessageQuad } from 'rdf-writer.ts';

const { namedNode, quad } = DataFactory;
const entries: MessageQuad[] = [
  { quad: quad(namedNode('http://example.org/s1'), namedNode('http://example.org/p'), namedNode('http://example.org/o1')), messageCounter: 0 },
  { quad: quad(namedNode('http://example.org/s2'), namedNode('http://example.org/p'), namedNode('http://example.org/o2')), messageCounter: 1 },
];

const writer = new Writer({ format: 'N-Quads' });
writer.addQuads(entries);
writer.end((error, serialized) => {
  if (error) throw error;
  console.log(serialized);
});
```

Line formats write `VERSION "1.2-messages"` and `MESSAGE`. Turtle/TriG-style output writes `@version "1.2-messages" .` and `@message .`. Gaps in `messageCounter` values are preserved as empty messages.

## RDF-JS data model and helpers

The package includes a small RDF-JS-compatible data model so it can be used without another data factory:

```ts
import { DataFactory } from 'rdf-writer.ts';

const s = DataFactory.namedNode('http://example.org/s');
const p = DataFactory.namedNode('http://example.org/p');
const o = DataFactory.literal('hello', 'en');
const q = DataFactory.quad(s, p, o);

console.log(q.termType);        // Quad
console.log(q.object.termType); // Literal
console.log(q.equals(q));       // true
```

Public exports include:

- `Writer`: string/stream writer with `quadToString()`, `quadsToString()`, `addQuad()`, `addQuads()`, `addPrefix()`, `addPrefixes()`, `blank()`, `list()`, `addMessage()`, and `end()`.
- `StreamWriter`: Node.js object-mode transform stream for quad streams.
- `DataFactory`: RDF-JS factory for `namedNode()`, `blankNode()`, `literal()`, `variable()`, `defaultGraph()`, and `quad()`.
- `NamedNode`, `BlankNode`, `Literal`, `Variable`, `DefaultGraph`, `Quad`, and `Message`: lightweight RDF-JS term classes.
- Factory aliases: `namedNode`, `blankNode`, `literal`, `variable`, `defaultGraph`, and `quad`.
- `termToString()`: serialize a term for diagnostics and IDs.
- `quadToString()`: serialize a quad in line syntax.
- `termToId()`: convert terms to stable string IDs.
- `isMessageQuad()`: type guard for `{ quad, messageCounter }` entries.
- `toMessages()`: group message entries into `Message[]`.

## Performance notes

The writer is designed for low overhead on common RDF-JS output paths: it groups Turtle/TriG statements incrementally, writes chunks directly to the target stream when provided, and avoids additional runtime dependencies beyond RDF-JS types.

Dedicated writer benchmarks against N3.js and Graphy are not yet part of this repository. The related parser package currently publishes this quick parsing snapshot against N3.js and Graphy, included here as ecosystem context rather than as writer throughput data:

| Statements | Parser | Time | Throughput | Input | RSS delta |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1,000 | rdf-parser.ts | 0.001s | 773,045 q/s | 0.1 MiB | 0.5 MiB |
| 1,000 | rdf-parser.ts/relax | 0.002s | 525,116 q/s | 0.1 MiB | 0.3 MiB |
| 1,000 | N3.js | 0.006s | 166,228 q/s | 0.1 MiB | 1.9 MiB |
| 1,000 | Graphy | 0.003s | 317,648 q/s | 0.1 MiB | 1.9 MiB |
| 1,000 | Graphy/relax | 0.002s | 594,226 q/s | 0.1 MiB | -1.0 MiB |
| 10,000 | rdf-parser.ts | 0.010s | 959,069 q/s | 0.9 MiB | 1.4 MiB |
| 10,000 | rdf-parser.ts/relax | 0.010s | 982,829 q/s | 0.9 MiB | 4.7 MiB |
| 10,000 | N3.js | 0.026s | 386,462 q/s | 0.9 MiB | 3.3 MiB |
| 10,000 | Graphy | 0.011s | 881,601 q/s | 0.9 MiB | 7.5 MiB |
| 10,000 | Graphy/relax | 0.005s | 1,857,713 q/s | 0.9 MiB | 2.4 MiB |

Run the parser benchmark report from the sibling parser repository with `npm run perf`, `npm run perf:quick`, or `npm run perf:graphy`.

## License

© Ghent University - IMEC

MIT Licensed
