import { Transform, Readable, TransformCallback } from 'node:stream';
import * as RDFJS from '@rdfjs/types';

type TermType = RDFJS.Term['termType'];
type Term = RDFJS.Term;
interface WriterOptions {
    format?: string;
    prefixes?: Record<string, string | NamedNodeLike>;
    baseIRI?: string;
    end?: boolean;
    lists?: Record<string, TermLike[]>;
    rdfMessages?: boolean;
    messages?: boolean;
    version?: string;
}
interface WriterOutputStream {
    write(chunk: string, encoding?: BufferEncoding, callback?: (error?: Error | null) => void): unknown;
    end(callback?: (error?: Error | null, result?: string) => void): unknown;
}
type WriterEndCallback = (error?: Error | null, output?: string) => void;
interface DataFactoryLike {
    namedNode(value: string): NamedNodeLike;
    blankNode(value?: string): BlankNodeLike;
    literal(value: string, languageOrDatatype?: string | NamedNodeLike | RDFJS.DirectionalLanguage, datatype?: NamedNodeLike): LiteralLike;
    variable?(value: string): VariableLike;
    defaultGraph(): DefaultGraphLike;
    quad(subject: TermLike, predicate: TermLike, object: TermLike, graph?: TermLike): QuadLike;
}
type TermLike = RDFJS.Term;
type NamedNodeLike = RDFJS.NamedNode;
type BlankNodeLike = RDFJS.BlankNode;
type VariableLike = RDFJS.Variable;
type DefaultGraphLike = RDFJS.DefaultGraph;
type LiteralLike = RDFJS.Literal;
type QuadLike = RDFJS.BaseQuad;
interface MessageQuad {
    quad: QuadLike;
    messageCounter: number;
}
type WriterOutputItem = QuadLike | MessageQuad;
interface MessageQuadArray extends Array<MessageQuad> {
    messageCount: number;
}
type LiteralDirection = RDFJS.DirectionalLanguage['direction'];
declare class NamedNode implements NamedNodeLike {
    readonly value: string;
    readonly termType: "NamedNode";
    constructor(value: string);
    equals(other: unknown): boolean;
}
declare class BlankNode implements BlankNodeLike {
    readonly value: string;
    readonly termType: "BlankNode";
    constructor(value: string);
    equals(other: unknown): boolean;
}
declare class Variable implements VariableLike {
    readonly value: string;
    readonly termType: "Variable";
    constructor(value: string);
    equals(other: unknown): boolean;
}
declare class DefaultGraph implements DefaultGraphLike {
    readonly termType: "DefaultGraph";
    readonly value = "";
    equals(other: unknown): boolean;
}
declare class Literal implements LiteralLike {
    readonly value: string;
    readonly language: string;
    readonly datatype: NamedNodeLike;
    readonly termType: "Literal";
    readonly direction?: LiteralDirection;
    constructor(value: string, language?: string, datatype?: NamedNodeLike, direction?: LiteralDirection);
    equals(other: unknown): boolean;
}
declare class Quad implements QuadLike {
    readonly subject: TermLike;
    readonly predicate: TermLike;
    readonly object: TermLike;
    readonly graph: TermLike;
    readonly termType: "Quad";
    readonly value = "";
    constructor(subject: TermLike, predicate: TermLike, object: TermLike, graph?: TermLike);
    equals(other: unknown): boolean;
}
declare class Message extends Array<QuadLike> {
    readonly messageCounter: number;
    static get [Symbol.species](): ArrayConstructor;
    constructor(messageCounter: number, quads?: Iterable<QuadLike>);
}
declare const DataFactory: DataFactoryLike;
type WriterTerm = TermLike | SerializedTerm;
type WriterInputItem = QuadLike | MessageQuad;
type WriterBlankChild = {
    predicate: WriterTerm;
    object: WriterTerm;
};
declare class SerializedTerm implements BlankNodeLike {
    readonly value: string;
    readonly termType: "BlankNode";
    constructor(value: string);
    equals(other: unknown): boolean;
}
declare class Writer {
    private readonly outputStream;
    private readonly endStream;
    private readonly lineMode;
    private readonly lists?;
    private graph;
    private subject;
    private predicate;
    private prefixByIri;
    private baseIRI?;
    private closed;
    private messagesEnabled;
    private messageVersion;
    private messagesStarted;
    private currentMessageCounter;
    private hasWrittenMessage;
    private trailingEmptyMessageCount;
    constructor(options?: WriterOptions);
    constructor(outputStream: WriterOutputStream, options?: WriterOptions);
    quadToString(subject: WriterTerm, predicate: WriterTerm, object: WriterTerm, graph?: WriterTerm): string;
    quadsToString(quads: Iterable<QuadLike>): string;
    addQuad(quad: WriterInputItem, done?: (error?: Error | null) => void): void;
    addQuad(subject: WriterTerm, predicate: WriterTerm, object: WriterTerm, done?: (error?: Error | null) => void): void;
    addQuad(subject: WriterTerm, predicate: WriterTerm, object: WriterTerm, graph: WriterTerm, done?: (error?: Error | null) => void): void;
    addQuads(quads: Iterable<WriterInputItem>): void;
    addMessage(message: Iterable<QuadLike> | Message, done?: (error?: Error | null) => void): void;
    addPrefix(prefix: string, iri: string | NamedNodeLike, done?: (error?: Error | null) => void): void;
    addPrefixes(prefixes: Record<string, string | NamedNodeLike>, done?: (error?: Error | null) => void): void;
    blank(): TermLike;
    blank(children: WriterBlankChild[]): TermLike;
    blank(child: WriterBlankChild): TermLike;
    blank(predicate: WriterTerm, object: WriterTerm): TermLike;
    list(elements?: WriterTerm[]): TermLike;
    end(done?: WriterEndCallback): void;
    private writePrettyQuad;
    private writeQuadTerms;
    private writeMessageQuad;
    private ensureMessagesStarted;
    private writeMessageDelimiter;
    private closeCurrentStatement;
    private encodeSubject;
    private encodePredicate;
    private encodeObject;
    private encodeIriOrBlank;
    private encodeLiteral;
    private encodeQuad;
    private toPrefixedName;
    private escapeIri;
    private write;
    private assertOpen;
}
declare class StreamWriter extends Transform {
    private readonly writer;
    constructor(options?: WriterOptions);
    import(stream: Readable): this;
    _transform(quad: WriterInputItem, _encoding: BufferEncoding, callback: TransformCallback): void;
    _flush(callback: TransformCallback): void;
}
declare function termToString(term: TermLike): string;
declare function quadToString(quad: QuadLike): string;
declare function termToId(term: TermLike): string;
declare function isMessageQuad(value: unknown): value is MessageQuad;
declare function toMessages(output: Iterable<WriterOutputItem>, messageCount?: number): Message[];
declare const namedNode: (value: string) => NamedNodeLike;
declare const blankNode: (value?: string) => BlankNodeLike;
declare const literal: (value: string, languageOrDatatype?: string | NamedNodeLike | RDFJS.DirectionalLanguage, datatype?: NamedNodeLike) => LiteralLike;
declare const variable: ((value: string) => VariableLike) | undefined;
declare const defaultGraph: () => DefaultGraphLike;
declare const quad: (subject: TermLike, predicate: TermLike, object: TermLike, graph?: TermLike) => QuadLike;

export { BlankNode, type BlankNodeLike, DataFactory, type DataFactoryLike, DefaultGraph, type DefaultGraphLike, Literal, type LiteralLike, Message, type MessageQuad, type MessageQuadArray, NamedNode, type NamedNodeLike, Quad, type QuadLike, StreamWriter, type Term, type TermLike, type TermType, Variable, type VariableLike, Writer, type WriterEndCallback, type WriterOptions, type WriterOutputStream, blankNode, defaultGraph, isMessageQuad, literal, namedNode, quad, quadToString, termToId, termToString, toMessages, variable };
