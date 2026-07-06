"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  BlankNode: () => BlankNode,
  DataFactory: () => DataFactory,
  DefaultGraph: () => DefaultGraph,
  Literal: () => Literal,
  Message: () => Message,
  NamedNode: () => NamedNode,
  Quad: () => Quad,
  StreamWriter: () => StreamWriter,
  Variable: () => Variable,
  Writer: () => Writer,
  blankNode: () => blankNode,
  defaultGraph: () => defaultGraph,
  isMessageQuad: () => isMessageQuad,
  literal: () => literal,
  namedNode: () => namedNode,
  quad: () => quad,
  quadToString: () => quadToString,
  termToId: () => termToId,
  termToString: () => termToString,
  toMessages: () => toMessages,
  variable: () => variable
});
module.exports = __toCommonJS(index_exports);
var import_node_stream = require("stream");
var XSD = "http://www.w3.org/2001/XMLSchema#";
var RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
var RDF_TYPE = `${RDF}type`;
var RDF_LANG_STRING = `${RDF}langString`;
var XSD_STRING = `${XSD}string`;
var XSD_INTEGER = `${XSD}integer`;
var XSD_DECIMAL = `${XSD}decimal`;
var XSD_DOUBLE = `${XSD}double`;
var XSD_BOOLEAN = `${XSD}boolean`;
function sameTerm(a, b) {
  if (!b || typeof b !== "object" || !("termType" in b) || !("value" in b)) return false;
  const other = b;
  if (a.termType !== other.termType || a.value !== other.value) return false;
  if (a.termType === "Literal" && other.termType === "Literal") {
    return a.language === other.language && a.direction === other.direction && a.datatype.equals(other.datatype);
  }
  if (a.termType === "Quad" && other.termType === "Quad") {
    return a.subject.equals(other.subject) && a.predicate.equals(other.predicate) && a.object.equals(other.object) && a.graph.equals(other.graph);
  }
  return true;
}
var NamedNode = class {
  constructor(value) {
    this.value = value;
  }
  value;
  termType = "NamedNode";
  equals(other) {
    return sameTerm(this, other);
  }
};
var BlankNode = class {
  constructor(value) {
    this.value = value;
  }
  value;
  termType = "BlankNode";
  equals(other) {
    return sameTerm(this, other);
  }
};
var Variable = class {
  constructor(value) {
    this.value = value;
  }
  value;
  termType = "Variable";
  equals(other) {
    return sameTerm(this, other);
  }
};
var DefaultGraph = class {
  termType = "DefaultGraph";
  value = "";
  equals(other) {
    return sameTerm(this, other);
  }
};
var Literal = class {
  constructor(value, language = "", datatype = new NamedNode(language ? RDF_LANG_STRING : XSD_STRING), direction) {
    this.value = value;
    this.language = language;
    this.datatype = datatype;
    if (direction) this.direction = direction;
  }
  value;
  language;
  datatype;
  termType = "Literal";
  direction;
  equals(other) {
    return sameTerm(this, other);
  }
};
var Quad = class {
  constructor(subject, predicate, object, graph = defaultGraphSingleton) {
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.graph = graph;
  }
  subject;
  predicate;
  object;
  graph;
  termType = "Quad";
  value = "";
  equals(other) {
    return sameTerm(this, other);
  }
};
var Message = class _Message extends Array {
  constructor(messageCounter, quads = []) {
    super();
    this.messageCounter = messageCounter;
    Object.setPrototypeOf(this, _Message.prototype);
    for (const quad2 of quads) this.push(quad2);
  }
  messageCounter;
  static get [Symbol.species]() {
    return Array;
  }
};
var defaultGraphSingleton = new DefaultGraph();
var globalBlankNodeCounter = 0;
var DataFactory = {
  namedNode: (value) => new NamedNode(value),
  blankNode: (value) => new BlankNode(value ?? `b${globalBlankNodeCounter++}`),
  literal: (value, languageOrDatatype, datatype) => {
    if (typeof languageOrDatatype === "string") {
      const directionalSeparator = languageOrDatatype.indexOf("--");
      if (directionalSeparator >= 0) {
        const language2 = languageOrDatatype.slice(0, directionalSeparator).toLowerCase();
        const direction = languageOrDatatype.slice(directionalSeparator + 2).toLowerCase();
        return new Literal(value, language2, datatype ?? new NamedNode(RDF_LANG_STRING), direction);
      }
      const language = languageOrDatatype.toLowerCase();
      return new Literal(value, language, datatype ?? new NamedNode(language ? RDF_LANG_STRING : XSD_STRING));
    }
    if (isDirectionalLanguage(languageOrDatatype)) {
      return new Literal(
        value,
        languageOrDatatype.language.toLowerCase(),
        datatype ?? new NamedNode(RDF_LANG_STRING),
        languageOrDatatype.direction
      );
    }
    return new Literal(value, "", languageOrDatatype ?? datatype ?? new NamedNode(XSD_STRING));
  },
  variable: (value) => new Variable(value),
  defaultGraph: () => defaultGraphSingleton,
  quad: (subject, predicate, object, graph = defaultGraphSingleton) => new Quad(subject, predicate, object, graph)
};
function isDirectionalLanguage(value) {
  return Boolean(value && typeof value === "object" && "language" in value && !("termType" in value));
}
var SerializedTerm = class {
  constructor(value) {
    this.value = value;
  }
  value;
  termType = "BlankNode";
  equals(other) {
    return other === this;
  }
};
var Writer = class {
  outputStream;
  endStream;
  lineMode;
  lists;
  graph = defaultGraphSingleton;
  subject = null;
  predicate = null;
  prefixByIri;
  baseIRI;
  closed = false;
  messagesEnabled = false;
  messageVersion = "1.2-messages";
  messagesStarted = false;
  currentMessageCounter = 0;
  hasWrittenMessage = false;
  trailingEmptyMessageCount = 0;
  constructor(outputStreamOrOptions, maybeOptions) {
    let outputStream;
    let options;
    if (isWriterOutputStream(outputStreamOrOptions)) {
      outputStream = outputStreamOrOptions;
      options = maybeOptions ?? {};
    } else {
      options = outputStreamOrOptions ?? {};
    }
    if (outputStream) {
      this.outputStream = outputStream;
      this.endStream = options.end !== void 0 ? Boolean(options.end) : true;
    } else {
      let output = "";
      this.outputStream = {
        write: (chunk, _encoding, callback) => {
          output += chunk;
          callback?.(null);
        },
        end: (callback) => callback?.(null, output)
      };
      this.endStream = true;
    }
    this.lineMode = /(?:n-)?(?:triple|quad)s?/i.test(options.format ?? "");
    this.lists = options.lists;
    this.messagesEnabled = options.rdfMessages === true || options.messages === true || isMessagesVersion(options.version);
    if (options.version && isMessagesVersion(options.version)) this.messageVersion = options.version;
    if (!this.lineMode) {
      this.prefixByIri = /* @__PURE__ */ Object.create(null);
      if (options.baseIRI) this.baseIRI = options.baseIRI;
      if (options.prefixes) this.addPrefixes(options.prefixes);
    }
  }
  quadToString(subject, predicate, object, graph = defaultGraphSingleton) {
    const graphPart = graph.termType === "DefaultGraph" || !graph.value ? "" : ` ${this.encodeIriOrBlank(graph)}`;
    return `${this.encodeSubject(subject)} ${this.encodeIriOrBlank(predicate)} ${this.encodeObject(object)}${graphPart} .
`;
  }
  quadsToString(quads) {
    let output = "";
    for (const quad2 of quads) output += this.quadToString(quad2.subject, quad2.predicate, quad2.object, quad2.graph);
    return output;
  }
  addQuad(subjectOrQuad, predicateOrDone, object, graphOrDone, done) {
    try {
      this.assertOpen();
      let subject;
      let predicate;
      let quadObject;
      let graph;
      let callback = done;
      if (object === void 0 && isMessageQuad(subjectOrQuad)) {
        callback = typeof predicateOrDone === "function" ? predicateOrDone : done;
        this.writeMessageQuad(subjectOrQuad, callback);
        return;
      }
      if (object === void 0 && isQuadLike(subjectOrQuad)) {
        subject = subjectOrQuad.subject;
        predicate = subjectOrQuad.predicate;
        quadObject = subjectOrQuad.object;
        graph = subjectOrQuad.graph;
        callback = typeof predicateOrDone === "function" ? predicateOrDone : done;
      } else {
        if (!predicateOrDone || typeof predicateOrDone === "function" || !object) throw new Error("Expected subject, predicate, and object");
        subject = subjectOrQuad;
        predicate = predicateOrDone;
        quadObject = object;
        if (typeof graphOrDone === "function") {
          graph = defaultGraphSingleton;
          callback = graphOrDone;
        } else {
          graph = graphOrDone ?? defaultGraphSingleton;
        }
      }
      if (this.messagesEnabled) this.ensureMessagesStarted();
      this.writeQuadTerms(subject, predicate, quadObject, graph, callback);
      if (this.messagesEnabled) {
        this.hasWrittenMessage = true;
        this.trailingEmptyMessageCount = 0;
      }
    } catch (error) {
      const callback = typeof predicateOrDone === "function" ? predicateOrDone : typeof graphOrDone === "function" ? graphOrDone : done;
      callback?.(error instanceof Error ? error : new Error(String(error)));
    }
  }
  addQuads(quads) {
    for (const quad2 of quads) this.addQuad(quad2);
  }
  addMessage(message, done) {
    try {
      this.assertOpen();
      this.ensureMessagesStarted();
      if (this.hasWrittenMessage) this.writeMessageDelimiter();
      let wroteQuad = false;
      for (const quad2 of message) {
        wroteQuad = true;
        this.writeQuadTerms(quad2.subject, quad2.predicate, quad2.object, quad2.graph);
      }
      this.trailingEmptyMessageCount = wroteQuad ? 0 : this.trailingEmptyMessageCount + 1;
      this.hasWrittenMessage = true;
      done?.(null);
    } catch (error) {
      done?.(error instanceof Error ? error : new Error(String(error)));
    }
  }
  addPrefix(prefix, iri, done) {
    this.addPrefixes({ [prefix]: iri }, done);
  }
  addPrefixes(prefixes, done) {
    if (!this.prefixByIri) {
      done?.(null);
      return;
    }
    try {
      let wrote = false;
      for (const [prefix, iriValue] of Object.entries(prefixes)) {
        const iri = typeof iriValue === "string" ? iriValue : iriValue.value;
        if (this.subject !== null) this.closeCurrentStatement();
        this.prefixByIri[iri] = `${prefix}:`;
        this.write(`@prefix ${prefix}: <${this.escapeIri(iri)}>.
`, void 0);
        wrote = true;
      }
      if (wrote) this.write("\n", done);
      else done?.(null);
    } catch (error) {
      done?.(error instanceof Error ? error : new Error(String(error)));
    }
  }
  blank(predicateOrChildren, object) {
    let children;
    if (predicateOrChildren === void 0) children = [];
    else if (Array.isArray(predicateOrChildren)) children = predicateOrChildren;
    else if (isTermLike(predicateOrChildren)) children = [{ predicate: predicateOrChildren, object: object ?? defaultGraphSingleton }];
    else children = [predicateOrChildren];
    if (children.length === 0) return new SerializedTerm("[]");
    if (children.length === 1) {
      const child = children[0];
      if (!(child.object instanceof SerializedTerm)) {
        return new SerializedTerm(`[ ${this.encodePredicate(child.predicate)} ${this.encodeObject(child.object)} ]`);
      }
    }
    let output = "[";
    let lastPredicate = null;
    for (const [index, child] of children.entries()) {
      if (lastPredicate && child.predicate.equals(lastPredicate)) {
        output += `, ${this.encodeObject(child.object)}`;
      } else {
        output += `${index === 0 ? "\n  " : ";\n  "}${this.encodePredicate(child.predicate)} ${this.encodeObject(child.object)}`;
        lastPredicate = child.predicate;
      }
    }
    output += "\n]";
    return new SerializedTerm(output);
  }
  list(elements = []) {
    return new SerializedTerm(`(${elements.map((element) => this.encodeObject(element)).join(" ")})`);
  }
  end(done) {
    try {
      if (!this.closed && this.subject !== null) this.closeCurrentStatement();
      if (!this.closed && this.messagesStarted && this.trailingEmptyMessageCount > 0) {
        this.writeMessageDelimiter();
        this.trailingEmptyMessageCount = 0;
      }
      this.closed = true;
      if (!this.endStream) {
        done?.(null);
        return;
      }
      let called = false;
      const callback = (error, output) => {
        if (called) return;
        called = true;
        done?.(error, output);
      };
      try {
        this.outputStream.end(callback);
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    } catch (error) {
      done?.(error instanceof Error ? error : new Error(String(error)));
    }
  }
  writePrettyQuad(subject, predicate, object, graph, done) {
    if (!graph.equals(this.graph)) {
      if (this.subject !== null) this.write(this.graph.termType === "DefaultGraph" ? ".\n" : "\n}\n");
      if (graph.termType !== "DefaultGraph") this.write(`${this.encodeIriOrBlank(graph)} {
`);
      this.graph = graph;
      this.subject = null;
      this.predicate = null;
    }
    if (this.subject && subject.equals(this.subject)) {
      if (this.predicate && predicate.equals(this.predicate)) {
        this.write(`, ${this.encodeObject(object)}`, done);
      } else {
        this.predicate = predicate;
        this.write(`;
    ${this.encodePredicate(predicate)} ${this.encodeObject(object)}`, done);
      }
      return;
    }
    const separator = this.subject === null ? "" : ".\n";
    this.subject = subject;
    this.predicate = predicate;
    this.write(`${separator}${this.encodeSubject(subject)} ${this.encodePredicate(predicate)} ${this.encodeObject(object)}`, done);
  }
  writeQuadTerms(subject, predicate, object, graph, done) {
    if (this.lineMode) this.write(this.quadToString(subject, predicate, object, graph), done);
    else this.writePrettyQuad(subject, predicate, object, graph, done);
  }
  writeMessageQuad(entry, done) {
    if (!Number.isInteger(entry.messageCounter) || entry.messageCounter < 0) {
      throw new Error(`Invalid message counter ${entry.messageCounter}.`);
    }
    this.ensureMessagesStarted();
    if (entry.messageCounter < this.currentMessageCounter) {
      throw new Error(`Cannot write message counter ${entry.messageCounter} after ${this.currentMessageCounter}.`);
    }
    while (this.currentMessageCounter < entry.messageCounter) this.writeMessageDelimiter();
    this.writeQuadTerms(entry.quad.subject, entry.quad.predicate, entry.quad.object, entry.quad.graph, done);
    this.hasWrittenMessage = true;
    this.trailingEmptyMessageCount = 0;
  }
  ensureMessagesStarted() {
    this.messagesEnabled = true;
    if (this.messagesStarted) return;
    if (this.subject !== null) this.closeCurrentStatement();
    this.write(this.lineMode ? `VERSION "${escapeLiteral(this.messageVersion)}"
` : `@version "${escapeLiteral(this.messageVersion)}" .
`);
    this.messagesStarted = true;
    this.currentMessageCounter = 0;
  }
  writeMessageDelimiter() {
    if (this.subject !== null) this.closeCurrentStatement();
    this.write(this.lineMode ? "MESSAGE\n" : "@message .\n");
    this.currentMessageCounter++;
  }
  closeCurrentStatement() {
    this.write(this.graph.termType === "DefaultGraph" ? ".\n" : "\n}\n");
    this.subject = null;
    this.predicate = null;
    this.graph = defaultGraphSingleton;
  }
  encodeSubject(term) {
    return term.termType === "Quad" ? this.encodeQuad(term) : this.encodeIriOrBlank(term);
  }
  encodePredicate(term) {
    return term.termType === "NamedNode" && term.value === RDF_TYPE ? "a" : this.encodeIriOrBlank(term);
  }
  encodeObject(term) {
    if (term instanceof SerializedTerm) return term.value;
    if (term.termType === "Quad") return this.encodeQuad(term);
    if (term.termType === "Literal") return this.encodeLiteral(term);
    return this.encodeIriOrBlank(term);
  }
  encodeIriOrBlank(term) {
    if (term instanceof SerializedTerm) return term.value;
    if (term.termType === "BlankNode") {
      if (this.lists && term.value in this.lists) return this.list(this.lists[term.value]).value;
      return `_:${term.value}`;
    }
    if (term.termType !== "NamedNode") return `_:${term.value}`;
    let iri = this.baseIRI ? relativizeIri(term.value, this.baseIRI) : term.value;
    iri = this.escapeIri(iri);
    const prefixed = this.prefixByIri ? this.toPrefixedName(iri) : void 0;
    return prefixed ?? `<${iri}>`;
  }
  encodeLiteral(literalTerm) {
    const value = escapeLiteral(literalTerm.value);
    if (literalTerm.language) {
      const direction = literalTerm.direction ? `--${literalTerm.direction}` : "";
      return `"${value}"@${literalTerm.language}${direction}`;
    }
    if (this.lineMode) {
      if (literalTerm.datatype.value === XSD_STRING) return `"${value}"`;
    } else {
      switch (literalTerm.datatype.value) {
        case XSD_STRING:
          return `"${value}"`;
        case XSD_BOOLEAN:
          if (value === "true" || value === "false") return value;
          break;
        case XSD_INTEGER:
          if (/^[+-]?\d+$/.test(value)) return value;
          break;
        case XSD_DECIMAL:
          if (/^[+-]?(?:\d+\.\d*|\.\d+)$/.test(value)) return value;
          break;
        case XSD_DOUBLE:
          if (/^[+-]?(?:(?:\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+)$/.test(value)) return value;
          break;
      }
    }
    return `"${value}"^^${this.encodeIriOrBlank(literalTerm.datatype)}`;
  }
  encodeQuad(quadTerm) {
    const graph = quadTerm.graph.termType === "DefaultGraph" ? "" : ` ${this.encodeIriOrBlank(quadTerm.graph)}`;
    return `<<(${this.encodeSubject(quadTerm.subject)} ${this.encodePredicate(quadTerm.predicate)} ${this.encodeObject(quadTerm.object)}${graph})>>`;
  }
  toPrefixedName(iri) {
    if (!this.prefixByIri) return void 0;
    let bestIri = "";
    let bestPrefix = "";
    for (const [prefixIri, prefix] of Object.entries(this.prefixByIri)) {
      if (iri.startsWith(prefixIri) && prefixIri.length >= bestIri.length) {
        const local = iri.slice(prefixIri.length);
        if (isSafeLocalName(local)) {
          bestIri = prefixIri;
          bestPrefix = prefix;
        }
      }
    }
    return bestIri ? `${bestPrefix}${iri.slice(bestIri.length)}` : void 0;
  }
  escapeIri(iri) {
    return escapeIri(iri);
  }
  write(chunk, done) {
    this.outputStream.write(chunk, "utf8", done);
  }
  assertOpen() {
    if (this.closed) throw new Error("Cannot write because the writer has been closed.");
  }
};
var StreamWriter = class extends import_node_stream.Transform {
  writer;
  constructor(options = {}) {
    super({ encoding: "utf8", writableObjectMode: true });
    this.writer = new Writer({
      write: (chunk, _encoding, callback) => {
        this.push(chunk);
        callback?.(null);
      },
      end: (callback) => {
        this.push(null);
        callback?.(null);
      }
    }, options);
  }
  import(stream) {
    stream.on("data", (quad2) => this.write(quad2));
    stream.on("end", () => this.end());
    stream.on("error", (error) => this.emit("error", error));
    stream.on("prefix", (prefix, iri) => this.writer.addPrefix(prefix, iri));
    return this;
  }
  _transform(quad2, _encoding, callback) {
    this.writer.addQuad(quad2, callback);
  }
  _flush(callback) {
    this.writer.end(callback);
  }
};
function isQuadLike(value) {
  return Boolean(value && typeof value === "object" && "subject" in value && "predicate" in value && "object" in value && "graph" in value);
}
function isWriterOutputStream(value) {
  return Boolean(value && typeof value === "object" && "write" in value && typeof value.write === "function" && "end" in value && typeof value.end === "function");
}
function isTermLike(value) {
  return Boolean(value && typeof value === "object" && "termType" in value && "value" in value && "equals" in value);
}
function isSafeLocalName(value) {
  return /^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(value);
}
function escapeLiteral(value) {
  return value.replace(/["\\\t\n\r\b\f\u0000-\u001F]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g, replaceEscapedCharacter);
}
function escapeIri(value) {
  return value.replace(/[>"\\\t\n\r\b\f\u0000-\u001F]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g, replaceEscapedCharacter);
}
function replaceEscapedCharacter(character) {
  switch (character) {
    case "\\":
      return "\\\\";
    case '"':
      return '\\"';
    case "	":
      return "\\t";
    case "\n":
      return "\\n";
    case "\r":
      return "\\r";
    case "\b":
      return "\\b";
    case "\f":
      return "\\f";
    default: {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint > 65535) return `\\U${codePoint.toString(16).padStart(8, "0")}`;
      return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    }
  }
}
function relativizeIri(iri, baseIRI) {
  try {
    const base = new URL(baseIRI);
    const target = new URL(iri);
    if (base.origin !== target.origin) return iri;
    if (base.pathname === target.pathname && base.search === target.search) return target.hash ? `${target.hash}` : "";
    const directory = base.pathname.endsWith("/") ? base.pathname : base.pathname.slice(0, base.pathname.lastIndexOf("/") + 1);
    if (target.pathname.startsWith(directory)) return `${target.pathname.slice(directory.length)}${target.search}${target.hash}`;
    return iri;
  } catch {
    return iri.startsWith(baseIRI) ? iri.slice(baseIRI.length) : iri;
  }
}
function isMessagesVersion(version) {
  return typeof version === "string" && version.toLowerCase().endsWith("-messages");
}
function escapeString(value) {
  return value.replace(/[\\"\n\r\t\b\f]/g, (character) => {
    switch (character) {
      case "\\":
        return "\\\\";
      case '"':
        return '\\"';
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "	":
        return "\\t";
      case "\b":
        return "\\b";
      case "\f":
        return "\\f";
      default:
        return character;
    }
  });
}
function termToString(term) {
  switch (term.termType) {
    case "NamedNode":
      return `<${term.value.replace(/[>\\]/g, (character) => `\\${character}`)}>`;
    case "BlankNode":
      return `_:${term.value}`;
    case "Variable":
      return `?${term.value}`;
    case "DefaultGraph":
      return "";
    case "Literal": {
      const quoted = `"${escapeString(term.value)}"`;
      if (term.language) return `${quoted}@${term.direction ? `${term.language}--${term.direction}` : term.language}`;
      if (term.datatype.value === XSD_STRING) return quoted;
      return `${quoted}^^<${term.datatype.value}>`;
    }
    case "Quad":
      return `<<(${termToString(term.subject)} ${termToString(term.predicate)} ${termToString(term.object)})>>`;
  }
}
function quadToString(quad2) {
  const graph = quad2.graph.termType === "DefaultGraph" ? "" : ` ${termToString(quad2.graph)}`;
  return `${termToString(quad2.subject)} ${termToString(quad2.predicate)} ${termToString(quad2.object)}${graph} .`;
}
function termToId(term) {
  return termToString(term);
}
function isMessageQuad(value) {
  return Boolean(value && typeof value === "object" && "quad" in value && "messageCounter" in value);
}
function toMessages(output, messageCount) {
  const messages = [];
  const parsedMessageCount = messageCount ?? getMessageCount(output);
  let sawMessageCounters = false;
  for (const item of output) {
    const entry = isMessageQuad(item) ? item : { quad: item, messageCounter: 0 };
    sawMessageCounters ||= isMessageQuad(item);
    while (messages.length <= entry.messageCounter) messages.push(new Message(messages.length));
    messages[entry.messageCounter].push(entry.quad);
  }
  if (parsedMessageCount !== void 0) {
    while (messages.length < parsedMessageCount) messages.push(new Message(messages.length));
  } else if (!sawMessageCounters && messages.length === 0) {
    return [];
  }
  return messages;
}
function getMessageCount(output) {
  if (!Array.isArray(output) || !("messageCount" in output)) return void 0;
  const value = output.messageCount;
  return typeof value === "number" ? value : void 0;
}
var namedNode = DataFactory.namedNode;
var blankNode = DataFactory.blankNode;
var literal = DataFactory.literal;
var variable = DataFactory.variable;
var defaultGraph = DataFactory.defaultGraph;
var quad = DataFactory.quad;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BlankNode,
  DataFactory,
  DefaultGraph,
  Literal,
  Message,
  NamedNode,
  Quad,
  StreamWriter,
  Variable,
  Writer,
  blankNode,
  defaultGraph,
  isMessageQuad,
  literal,
  namedNode,
  quad,
  quadToString,
  termToId,
  termToString,
  toMessages,
  variable
});
