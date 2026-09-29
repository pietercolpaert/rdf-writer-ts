import type * as RDF from '@rdfjs/types';

export interface WriterOptions {
  /**
   * Output format hint. N-Triples and N-Quads (`application/n-quads`, `N-Triples`, …) write one statement per line;
   * any other value writes Turtle/TriG with grouping, prefixes, and abbreviations.
   */
  format?: string;
  /** Prefixes to declare and use for prefixed names in Turtle/TriG output. */
  prefixes?: Record<string, string | RDF.NamedNode>;
  /**
   * Base IRI against which IRIs are shortened to relative IRIs in Turtle/TriG output. No `@base` directive is
   * written, so a reader needs the same base IRI.
   */
  baseIRI?: string;
  /** When writing to an output stream: whether `end()` also ends that stream. Defaults to `true`. */
  end?: boolean;
  /** RDF lists to write in `( … )` syntax, keyed by the label of the blank node that heads each list. */
  lists?: Record<string, RDF.Term[]>;
  /** Write RDF Messages. */
  rdfMessages?: boolean;
  /** Alias of `rdfMessages`. */
  messages?: boolean;
  /** RDF version label; a `*-messages` label enables RDF Messages and is written in the version directive. */
  version?: string;
}

/** The part of a writable stream that the writer uses. */
export interface WriterOutputStream {
  write: (chunk: string, encoding?: BufferEncoding, callback?: (error?: Error | null) => void) => unknown;
  end: (callback?: (error?: Error | null, result?: string) => void) => unknown;
}

export type WriterCallback = (error?: Error | null) => void;
/** Receives the complete output when the writer collects its output in a string. */
export type WriterEndCallback = (error?: Error | null, output?: string) => void;

/** A quad annotated with the RDF Message it belongs to, as emitted by RDF Messages-aware parsers. */
export interface MessageQuad {
  quad: RDF.BaseQuad;
  /** Zero-based index of the message */
  messageCounter: number;
}

/** A predicate-object pair of a blank node property list created with `Writer#blank()`. */
export interface WriterBlankChild {
  predicate: RDF.Term;
  object: RDF.Term;
}

/** What the writer accepts: RDF/JS quads or `{ quad, messageCounter }` entries. */
export type WriterInputItem = RDF.BaseQuad | MessageQuad;

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD_STRING = `${XSD}string`;
const XSD_INTEGER = `${XSD}integer`;
const XSD_DECIMAL = `${XSD}decimal`;
const XSD_DOUBLE = `${XSD}double`;
const XSD_BOOLEAN = `${XSD}boolean`;

const DEFAULT_GRAPH: RDF.DefaultGraph = {
  termType: 'DefaultGraph',
  value: '',
  equals: (other?: RDF.Term | null): boolean => other?.termType === 'DefaultGraph',
};

/**
 * Already serialized Turtle syntax, returned by `Writer#blank()` and `Writer#list()` so that it can be used as the
 * object of a quad.
 */
class SerializedTerm implements RDF.BlankNode {
  public readonly termType = <const>'BlankNode';
  public constructor(public readonly value: string) {}
  public equals(other?: RDF.Term | null): boolean {
    return other === this;
  }
}

/**
 * Serializes RDF/JS quads to Turtle, TriG, N-Triples, or N-Quads, optionally as an RDF Message log.
 *
 * Without an output stream, the output is collected and passed to the `end()` callback. With one, chunks are
 * written to it as they are produced.
 */
export class Writer {
  private readonly outputStream: WriterOutputStream;
  private readonly endStream: boolean;
  private readonly lineMode: boolean;
  private readonly lists?: Record<string, RDF.Term[]>;
  private readonly prefixByIri: Record<string, string> | undefined;
  /** The entries of prefixByIri in declaration order, kept up to date for fast prefix lookups */
  private prefixList: [string, string][] = [];
  private readonly baseIRI?: string;
  private graph: RDF.Term = DEFAULT_GRAPH;
  private subject: RDF.Term | null = null;
  private predicate: RDF.Term | null = null;
  private closed = false;
  private messagesEnabled: boolean;
  private readonly messageVersion: string = '1.2-messages';
  private messagesStarted = false;
  private currentMessageCounter = 0;
  private hasWrittenMessage = false;
  private trailingEmptyMessageCount = 0;

  public constructor(options?: WriterOptions);
  public constructor(outputStream: WriterOutputStream, options?: WriterOptions);
  public constructor(outputStreamOrOptions?: WriterOutputStream | WriterOptions, maybeOptions?: WriterOptions) {
    let options: WriterOptions;
    if (isWriterOutputStream(outputStreamOrOptions)) {
      options = maybeOptions ?? {};
      this.outputStream = outputStreamOrOptions;
      this.endStream = options.end ?? true;
    } else {
      options = outputStreamOrOptions ?? {};
      let output = '';
      this.outputStream = {
        write: (chunk, _encoding, callback) => {
          output += chunk;
          callback?.(null);
        },
        end: callback => callback?.(null, output),
      };
      this.endStream = true;
    }

    this.lineMode = /(?:n-)?(?:triple|quad)s?/iu.test(options.format ?? '');
    this.lists = options.lists;
    this.messagesEnabled = options.rdfMessages === true || options.messages === true ||
      isMessagesVersion(options.version);
    if (isMessagesVersion(options.version)) {
      this.messageVersion = options.version!;
    }
    if (!this.lineMode) {
      this.prefixByIri = <Record<string, string>>Object.create(null);
      this.baseIRI = options.baseIRI;
      if (options.prefixes) {
        this.addPrefixes(options.prefixes);
      }
    }
  }

  /** Serializes one quad in N-Quads syntax (using the writer's prefixes and base IRI, if any). */
  public quadToString(
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
    graph: RDF.Term = DEFAULT_GRAPH,
  ): string {
    const graphPart = graph.termType === 'DefaultGraph' ? '' : ` ${this.encodeIriOrBlank(graph)}`;
    return `${this.encodeSubject(subject)} ${this.encodeIriOrBlank(predicate)} ${this.encodeObject(object)}${graphPart} .\n`;
  }

  /** Serializes quads in N-Quads syntax. */
  public quadsToString(quads: Iterable<RDF.BaseQuad>): string {
    let output = '';
    for (const quad of quads) {
      output += this.quadToString(quad.subject, quad.predicate, quad.object, quad.graph);
    }
    return output;
  }

  /**
   * Writes a quad, given as an RDF/JS quad, as a `{ quad, messageCounter }` entry, or as separate terms.
   * Errors, such as a term that cannot be written in its position, are passed to the callback.
   */
  public addQuad(quad: WriterInputItem, done?: WriterCallback): void;
  public addQuad(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term, done?: WriterCallback): void;
  public addQuad(
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
    graph: RDF.Term,
    done?: WriterCallback,
  ): void;
  public addQuad(
    subjectOrQuad: RDF.Term | WriterInputItem,
    predicateOrDone?: RDF.Term | WriterCallback,
    object?: RDF.Term,
    graphOrDone?: RDF.Term | WriterCallback,
    done?: WriterCallback,
  ): void {
    const callback = typeof predicateOrDone === 'function' ?
      predicateOrDone :
        (typeof graphOrDone === 'function' ? graphOrDone : done);
    try {
      this.assertOpen();
      if (object === undefined && isMessageQuad(subjectOrQuad)) {
        this.writeMessageQuad(subjectOrQuad, callback);
        return;
      }

      let quad: RDF.BaseQuad;
      if (object === undefined && isQuad(subjectOrQuad)) {
        quad = subjectOrQuad;
      } else {
        if (!predicateOrDone || typeof predicateOrDone === 'function' || !object) {
          throw new Error('Expected subject, predicate, and object');
        }
        quad = <RDF.BaseQuad>{
          subject: <RDF.Term>subjectOrQuad,
          predicate: predicateOrDone,
          object,
          graph: typeof graphOrDone === 'object' ? graphOrDone : DEFAULT_GRAPH,
        };
      }

      if (this.messagesEnabled) {
        this.ensureMessagesStarted();
      }
      this.writeQuadTerms(quad.subject, quad.predicate, quad.object, quad.graph, callback);
      if (this.messagesEnabled) {
        this.hasWrittenMessage = true;
        this.trailingEmptyMessageCount = 0;
      }
    } catch (error: unknown) {
      callback?.(toError(error));
    }
  }

  /** Writes quads or `{ quad, messageCounter }` entries. */
  public addQuads(quads: Iterable<WriterInputItem>): void {
    for (const quad of quads) {
      this.addQuad(quad);
    }
  }

  /**
   * Writes the quads of one RDF Message, such as a `Message` of rdf-parser-ts, preceded by a message delimiter
   * when it is not the first message. An empty iterable writes an empty message.
   */
  public addMessage(message: Iterable<RDF.BaseQuad>, done?: WriterCallback): void {
    try {
      this.assertOpen();
      this.ensureMessagesStarted();
      if (this.hasWrittenMessage) {
        this.writeMessageDelimiter();
      }
      let wroteQuad = false;
      for (const quad of message) {
        wroteQuad = true;
        this.writeQuadTerms(quad.subject, quad.predicate, quad.object, quad.graph);
      }
      this.trailingEmptyMessageCount = wroteQuad ? 0 : this.trailingEmptyMessageCount + 1;
      this.hasWrittenMessage = true;
      done?.(null);
    } catch (error: unknown) {
      done?.(toError(error));
    }
  }

  /** Declares a prefix; ignored in N-Triples/N-Quads output. */
  public addPrefix(prefix: string, iri: string | RDF.NamedNode, done?: WriterCallback): void {
    this.addPrefixes({ [prefix]: iri }, done);
  }

  /** Declares prefixes; ignored in N-Triples/N-Quads output. An open statement is closed first. */
  public addPrefixes(prefixes: Record<string, string | RDF.NamedNode>, done?: WriterCallback): void {
    if (!this.prefixByIri) {
      done?.(null);
      return;
    }
    const entries = Object.entries(prefixes);
    if (entries.length === 0) {
      done?.(null);
      return;
    }
    if (this.subject !== null) {
      this.closeCurrentStatement();
    }
    for (const [ prefix, iriValue ] of entries) {
      const iri = typeof iriValue === 'string' ? iriValue : iriValue.value;
      this.prefixByIri[iri] = `${prefix}:`;
      this.write(`@prefix ${prefix}: <${escapeIri(iri)}>.\n`);
    }
    this.prefixList = Object.entries(this.prefixByIri);
    this.write('\n', done);
  }

  /**
   * Creates a blank node property list (`[ p o; … ]`) to use as the object of a quad: without arguments `[]`, or
   * from one predicate and object, one child, or an array of children.
   */
  public blank(): RDF.BlankNode;
  public blank(children: WriterBlankChild[]): RDF.BlankNode;
  public blank(child: WriterBlankChild): RDF.BlankNode;
  public blank(predicate: RDF.Term, object: RDF.Term): RDF.BlankNode;
  public blank(
    predicateOrChildren?: RDF.Term | WriterBlankChild | WriterBlankChild[],
    object?: RDF.Term,
  ): RDF.BlankNode {
    let children: WriterBlankChild[];
    if (predicateOrChildren === undefined) {
      children = [];
    } else if (Array.isArray(predicateOrChildren)) {
      children = predicateOrChildren;
    } else if ('termType' in predicateOrChildren) {
      if (!object) {
        throw new Error('Expected an object for the blank node property');
      }
      children = [{ predicate: predicateOrChildren, object }];
    } else {
      children = [ predicateOrChildren ];
    }

    if (children.length === 0) {
      return new SerializedTerm('[]');
    }
    if (children.length === 1 && !(children[0]!.object instanceof SerializedTerm)) {
      const child = children[0]!;
      return new SerializedTerm(`[ ${this.encodePredicate(child.predicate)} ${this.encodeObject(child.object)} ]`);
    }

    let output = '[';
    let lastPredicate: RDF.Term | null = null;
    for (const [ index, child ] of children.entries()) {
      if (lastPredicate && child.predicate.equals(lastPredicate)) {
        output += `, ${this.encodeObject(child.object)}`;
      } else {
        output += `${index === 0 ? '\n  ' : ';\n  '}${this.encodePredicate(child.predicate)} ${this.encodeObject(child.object)}`;
        lastPredicate = child.predicate;
      }
    }
    return new SerializedTerm(`${output}\n]`);
  }

  /** Creates an RDF list (`( … )`) to use as the object of a quad. */
  public list(elements: RDF.Term[] = []): RDF.BlankNode {
    return new SerializedTerm(`(${elements.map(element => this.encodeObject(element)).join(' ')})`);
  }

  /**
   * Closes the open statement and the output. When the writer collects its output, the callback receives it.
   * Writing after `end()` reports an error.
   */
  public end(done?: WriterEndCallback): void {
    try {
      if (!this.closed) {
        if (this.subject !== null) {
          this.closeCurrentStatement();
        }
        if (this.trailingEmptyMessageCount > 0) {
          this.writeMessageDelimiter();
        }
      }
      this.closed = true;
      if (this.endStream) {
        this.outputStream.end(done);
      } else {
        done?.(null);
      }
    } catch (error: unknown) {
      done?.(toError(error));
    }
  }

  private writePrettyQuad(
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
    graph: RDF.Term,
    done?: WriterCallback,
  ): void {
    if (!graph.equals(this.graph)) {
      if (this.subject !== null) {
        this.write(this.graph.termType === 'DefaultGraph' ? '.\n' : '\n}\n');
      }
      if (graph.termType !== 'DefaultGraph') {
        this.write(`${this.encodeIriOrBlank(graph)} {\n`);
      }
      this.graph = graph;
      this.subject = null;
      this.predicate = null;
    }

    if (this.subject && subject.equals(this.subject)) {
      if (this.predicate && predicate.equals(this.predicate)) {
        this.write(`, ${this.encodeObject(object)}`, done);
      } else {
        this.predicate = predicate;
        this.write(`;\n    ${this.encodePredicate(predicate)} ${this.encodeObject(object)}`, done);
      }
      return;
    }

    const separator = this.subject === null ? '' : '.\n';
    const line = `${this.encodeSubject(subject)} ${this.encodePredicate(predicate)} ${this.encodeObject(object)}`;
    this.subject = subject;
    this.predicate = predicate;
    this.write(`${separator}${line}`, done);
  }

  private writeQuadTerms(
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
    graph: RDF.Term,
    done?: WriterCallback,
  ): void {
    if (this.lineMode) {
      this.write(this.quadToString(subject, predicate, object, graph), done);
    } else {
      this.writePrettyQuad(subject, predicate, object, graph, done);
    }
  }

  private writeMessageQuad(entry: MessageQuad, done?: WriterCallback): void {
    if (!Number.isInteger(entry.messageCounter) || entry.messageCounter < 0) {
      throw new Error(`Invalid message counter ${entry.messageCounter}.`);
    }
    this.ensureMessagesStarted();
    if (entry.messageCounter < this.currentMessageCounter) {
      throw new Error(`Cannot write message counter ${entry.messageCounter} after ${this.currentMessageCounter}.`);
    }
    while (this.currentMessageCounter < entry.messageCounter) {
      this.writeMessageDelimiter();
    }
    this.writeQuadTerms(entry.quad.subject, entry.quad.predicate, entry.quad.object, entry.quad.graph, done);
    this.hasWrittenMessage = true;
    this.trailingEmptyMessageCount = 0;
  }

  private ensureMessagesStarted(): void {
    this.messagesEnabled = true;
    if (this.messagesStarted) {
      return;
    }
    if (this.subject !== null) {
      this.closeCurrentStatement();
    }
    const version = escapeLiteral(this.messageVersion);
    this.write(this.lineMode ? `VERSION "${version}"\n` : `@version "${version}" .\n`);
    this.messagesStarted = true;
  }

  private writeMessageDelimiter(): void {
    if (this.subject !== null) {
      this.closeCurrentStatement();
    }
    this.write(this.lineMode ? 'MESSAGE\n' : '@message .\n');
    this.currentMessageCounter++;
    this.trailingEmptyMessageCount = 0;
  }

  private closeCurrentStatement(): void {
    this.write(this.graph.termType === 'DefaultGraph' ? '.\n' : '\n}\n');
    this.subject = null;
    this.predicate = null;
    this.graph = DEFAULT_GRAPH;
  }

  private encodeSubject(term: RDF.Term): string {
    if (term.termType === 'Quad') {
      throw new Error('RDF 1.2 does not allow triple terms as subjects');
    }
    return this.encodeIriOrBlank(term);
  }

  private encodePredicate(term: RDF.Term): string {
    return term.termType === 'NamedNode' && term.value === RDF_TYPE ? 'a' : this.encodeIriOrBlank(term);
  }

  private encodeObject(term: RDF.Term): string {
    if (term.termType === 'Quad') {
      return this.encodeTripleTerm(term);
    }
    if (term.termType === 'Literal') {
      return this.encodeLiteral(term);
    }
    return this.encodeIriOrBlank(term);
  }

  /** Encodes a named node, blank node, or variable; other terms cannot appear in these positions. */
  private encodeIriOrBlank(term: RDF.Term): string {
    if (term instanceof SerializedTerm) {
      return term.value;
    }
    switch (term.termType) {
      case 'NamedNode': {
        // A prefixed name is preferred over a relative IRI. Local names of prefixed names only contain safe
        // characters, so they need no escaping.
        const prefixed = this.toPrefixedName(term.value);
        if (prefixed) {
          return prefixed;
        }
        return `<${escapeIri(this.baseIRI ? relativizeIri(term.value, this.baseIRI) : term.value)}>`;
      }
      case 'BlankNode': {
        const list = this.lists?.[term.value];
        return list ? this.list(list).value : `_:${term.value}`;
      }
      case 'Variable':
        return `?${term.value}`;
      default:
        throw new Error(`Cannot write a ${term.termType} in this position`);
    }
  }

  private encodeLiteral(literal: RDF.Literal): string {
    const value = escapeLiteral(literal.value);
    if (literal.language) {
      const direction = literal.direction ? `--${literal.direction}` : '';
      return `"${value}"@${literal.language}${direction}`;
    }
    const datatype = literal.datatype.value;
    if (datatype === XSD_STRING) {
      return `"${value}"`;
    }
    if (!this.lineMode && isAbbreviable(datatype, value)) {
      return value;
    }
    return `"${value}"^^${this.encodeIriOrBlank(literal.datatype)}`;
  }

  private encodeTripleTerm(quad: RDF.BaseQuad): string {
    if (quad.graph.termType !== 'DefaultGraph') {
      throw new Error('RDF 1.2 triple terms cannot have a graph');
    }
    return `<<(${this.encodeSubject(quad.subject)} ${this.encodePredicate(quad.predicate)} ${this.encodeObject(quad.object)})>>`;
  }

  /** Uses the first declared prefix of `iri` whose remainder is a safe local name, as N3.js does. */
  private toPrefixedName(iri: string): string | undefined {
    for (const [ prefixIri, prefix ] of this.prefixList) {
      if (iri.startsWith(prefixIri) && isSafeLocalName(iri, prefixIri.length)) {
        return prefix + iri.slice(prefixIri.length);
      }
    }
    return undefined;
  }

  private write(chunk: string, done?: WriterCallback): void {
    this.outputStream.write(chunk, 'utf8', done);
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('Cannot write because the writer has been closed.');
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isQuad(value: RDF.Term | WriterInputItem): value is RDF.BaseQuad {
  return 'subject' in value && 'predicate' in value && 'object' in value && 'graph' in value;
}

function isMessageQuad(value: RDF.Term | WriterInputItem): value is MessageQuad {
  return 'quad' in value && 'messageCounter' in value;
}

function isWriterOutputStream(value: unknown): value is WriterOutputStream {
  return Boolean(value && typeof value === 'object' && 'write' in value && typeof value.write === 'function' &&
    'end' in value && typeof value.end === 'function');
}

function isMessagesVersion(version: string | undefined): boolean {
  return typeof version === 'string' && version.toLowerCase().endsWith('-messages');
}

/** Whether a literal can be written as a bare Turtle number or boolean with the same lexical value. */
function isAbbreviable(datatype: string, value: string): boolean {
  switch (datatype) {
    case XSD_BOOLEAN:
      return value === 'true' || value === 'false';
    case XSD_INTEGER:
      return /^[+-]?\d+$/u.test(value);
    case XSD_DECIMAL:
      return /^[+-]?(?:\d+\.\d*|\.\d+)$/u.test(value);
    case XSD_DOUBLE:
      return /^[+-]?(?:\d+\.\d*|\.\d+|\d+)[Ee][+-]?\d+$/u.test(value);
    default:
      return false;
  }
}

/** Whether `value` from `start` on is a local name that needs no escaping: `[A-Za-z0-9_][A-Za-z0-9_-]*` */
function isSafeLocalName(value: string, start: number): boolean {
  if (start >= value.length) {
    return false;
  }
  for (let i = start; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (!((code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || code === 95 ||
      (code === 45 && i > start))) {
      return false;
    }
  }
  return true;
}

const ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  '"': '\\"',
  '\t': '\\t',
  '\n': '\\n',
  '\r': '\\r',
  '\b': '\\b',
  '\f': '\\f',
};

/**
 * Escapes quotes, backslashes, and control characters, and, as N3.js does, characters outside the Basic
 * Multilingual Plane (as `\\U0001f600`).
 */
function replaceEscapedCharacter(character: string): string {
  const escape = ESCAPES[character];
  if (escape) {
    return escape;
  }
  const codePoint = character.codePointAt(0)!;
  return codePoint > 0xFFFF ?
    `\\U${codePoint.toString(16).padStart(8, '0')}` :
    `\\u${codePoint.toString(16).padStart(4, '0')}`;
}

// Quick checks for a character that must be escaped: a control character, `"`, `\\`, the first half of a surrogate
// pair (a character outside the Basic Multilingual Plane), or, in IRIs, `>`. Most values contain none, so testing
// first avoids running the replacing regular expression. They match UTF-16 code units, so they cannot use the u flag.
// eslint-disable-next-line no-control-regex, require-unicode-regexp
const LITERAL_NEEDS_ESCAPING = /[\u0000-\u001F"\\\uD800-\uDBFF]/;
// eslint-disable-next-line no-control-regex, require-unicode-regexp
const IRI_NEEDS_ESCAPING = /[\u0000-\u001F">\\\uD800-\uDBFF]/;

function escapeLiteral(value: string): string {
  return LITERAL_NEEDS_ESCAPING.test(value) ?
    // eslint-disable-next-line no-control-regex -- control characters are exactly what must be escaped
    value.replaceAll(/["\\\u0000-\u001F\u{10000}-\u{10FFFF}]/gu, replaceEscapedCharacter) :
    value;
}

function escapeIri(value: string): string {
  return IRI_NEEDS_ESCAPING.test(value) ?
    // eslint-disable-next-line no-control-regex -- control characters are exactly what must be escaped
    value.replaceAll(/[>"\\\u0000-\u001F\u{10000}-\u{10FFFF}]/gu, replaceEscapedCharacter) :
    value;
}

interface IriParts {
  /** Scheme and authority, such as `http://example.org` */
  origin: string;
  path: string;
  /** Including the `?`, or undefined when there is no query */
  query?: string;
  /** Including the `#`, or undefined when there is no fragment */
  fragment?: string;
}

/** Splits a hierarchical IRI with an authority; other IRIs return undefined. */
function splitIri(iri: string): IriParts | undefined {
  const match = /^([A-Za-z][\d+.A-Za-z-]*:\/\/[^#/?]*)([^#?]*)(\?[^#]*)?(#.*)?$/su.exec(iri);
  return match ? { origin: match[1]!, path: match[2]!, query: match[3], fragment: match[4] } : undefined;
}

function hasDotSegments(path: string): boolean {
  return /(?:^|\/)\.\.?(?:\/|$)/u.test(path);
}

/**
 * Shortens `iri` to the shortest reference relative to `baseIRI` that resolves back to exactly `iri` with the
 * algorithm of RFC 3986 section 5.2, using `../` where needed. IRIs with another scheme or authority, and IRIs whose
 * path has dot segments (which resolution would remove), are returned unchanged.
 */
function relativizeIri(iri: string, baseIRI: string): string {
  const base = splitIri(baseIRI);
  const target = splitIri(iri);
  if (!base || !target || base.origin !== target.origin) {
    return iri;
  }
  const fragment = target.fragment ?? '';
  // Same document, or same path with another query
  if (target.path === base.path) {
    if (target.query === base.query) {
      return fragment;
    }
    if (target.query !== undefined) {
      return target.query + fragment;
    }
  }
  if (target.path === '' || hasDotSegments(target.path) || hasDotSegments(base.path)) {
    return iri;
  }

  // Walk up from the directory of the base path to the longest common one, then down to the target
  const directory = (base.path || '/').split('/').slice(0, -1);
  const segments = target.path.split('/');
  let common = 0;
  while (common < directory.length && common < segments.length - 1 && directory[common] === segments[common]) {
    common++;
  }
  let path = '../'.repeat(directory.length - common) + segments.slice(common).join('/');
  // An empty path, a path starting with `/`, or a colon in the first segment would be read differently
  if (path === '' || path.startsWith('/') || /^[^/]*:/u.test(path)) {
    path = `./${path}`;
  }
  const relative = path + (target.query ?? '') + fragment;
  return relative.length < iri.length ? relative : iri;
}
