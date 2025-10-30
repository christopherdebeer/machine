grammar Machine
// Hidden terminals for whitespace and comments
hidden terminal WS: /\s+/;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;

// Arrow terminals - ordered from most specific to least specific (BEFORE ID to avoid conflicts)
terminal BIDIRECTIONAL_ARROW: '<-->';
terminal BIDIRECTIONAL_LABELED: /<--[a-zA-Z0-9_]+-?-?>/;
terminal INHERIT_ARROW: '<|--';
terminal COMPOSE_ARROW: '*-->';
terminal AGGREGATE_ARROW: 'o-->';
terminal ARROW_DOUBLE: '-->';
terminal ARROW_LABEL_START_DOUBLE: '--';
terminal FAT_ARROW: '=>';
terminal FAT_ARROW_LABEL_START: '=';
terminal ARROW_SINGLE: '->';
terminal ARROW_LABEL_START_SINGLE: '-';

// Basic terminals
terminal ID: /[A-Za-z_][A-Za-z0-9_]*/;              // identifiers for node and attribute names (must start with letter or underscore)

// Template-aware string terminals
// TEMPLATE_STR is more specific (contains {{) so it must come BEFORE STR
terminal TEMPLATE_STR: /"([^"\\]|\\.)*\{\{([^"\\]|\\.)*"/;  // strings containing {{ markers for template detection
terminal STR: /"([^"\\]|\\.)*"/;        // regular double-quoted strings
terminal MLSTR: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;  // multiline strings

terminal NUMBER returns number: /[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/;
terminal QUESTION: '\?';

terminal EXTID: /#([A-Za-z0-9_][A-Za-z0-9_]*)/;

// NOTE: The following terminals are currently unused but may be needed for future
// custom arrow styling features. Commented out to eliminate Langium warnings.
// Uncomment if implementing custom arrow head compositions.
//
// terminal SHAFT_THIN: '-';
// terminal SHAFT_THICK: '=';
// terminal SHAFT_DOT: '.';
//
// terminal LEFT_ARROW: '<';
// terminal RIGHT_ARROW: '>';
// terminal LOLIPOP: '()';
//
// terminal SHAFT:
//     (SHAFT_THIN | SHAFT_THICK | SHAFT_DOT)+
// ;
//
// ArrowHead:
//     left?=(LEFT_ARROW | LOLIPOP) SHAFT+ right?=(RIGHT_ARROW | LOLIPOP)
// ;

STRING returns string: TEMPLATE_STR | STR | MLSTR;

// Qualified name for node references (e.g., parent.child)
QualifiedName returns string:
    ID ('.' ID)*
;

entry Machine:
    ('machine' title=STRING (annotations+=Annotation)* (('{'
        (attributes+=Attribute<false>)*
    '}' ';'?) | ';'?))?
    (edges+=Edge<true> | nodes+=Node<true> | attributes+=Attribute<true>)*
;

// Recursive AttributeValue supporting primitives, arrays, and nested objects
// Using explicit properties (primitiveValue, arrayValue, objectValue) to enable
// proper type inference and avoid union type ambiguities
//
// Template strings are recognized at the terminal level (TEMPLATE_STR) which matches
// strings containing {{ markers. This allows template-aware completion without
// full structural parsing in the grammar.
AttributeValue:
    ObjectValue | ArrayValue | PrimitiveValue
;

// Object value: nested attributes enclosed in braces
ObjectValue:
    '{' (attributes+=Attribute<false>)* '}'
;

// Array value: comma-separated AttributeValues enclosed in brackets
ArrayValue:
    '[' (values+=AttributeValue (',' values+=AttributeValue)*)? ']'
;

// Primitive value: string (including template strings), number, ID, or external ID
// Template strings are detected via the TEMPLATE_STR terminal
PrimitiveValue:
    value=(EXTID|STRING|ID|NUMBER)
;

// Annotation for nodes (e.g., @Abstract, @Singleton, @Deprecated, @note, @style(color: red;))
// Supports both string values and attribute-style parameters
Annotation:
    '@' name=ID ('(' (value=STRING | attributes=AnnotationAttributes) ')')?
;

// Attribute-style parameters for annotations (e.g., @style(color: red; penwidth: 3;))
// Similar to EdgeAttribute but for annotations
AnnotationAttributes:
    params+=AnnotationParam (';' params+=AnnotationParam)* ';'?
;

AnnotationParam:
    name=ID ':' value=EdgeAttributeValue
    | name=ID
;

// Note: The 'note' keyword is now treated as a regular node type
// Example: note targetNodeId "Documentation content";
// The node type 'note' is handled specially in the generator/validator

// Type definition that supports generic types (e.g., Promise<Result>, List<Step>)
TypeDef:
    base=ID ('<' generics+=TypeDef (',' generics+=TypeDef)* '>')? optional?=QUESTION?
;

Attribute<isRoot>:
    name=ID ('<' type=TypeDef '>')?
    (
        ':' value=AttributeValue ';'?
        | ';'
    )?
;

Node<isRoot>:
    (<isRoot> type=ID)?
    ('#')?
    name=QualifiedName
    (title=STRING)?
    (annotations+=Annotation)*
    (('{'
        (edges+=Edge<true> | nodes+=Node<true> | attributes+=Attribute<false>)*
    '}' ';'?) | ';'?)
;

EdgeAttributeValue returns string: EXTID|STRING|ID|NUMBER;

// Note: Order matters here to resolve ambiguity.
// Array syntax must come first, then name:value pairs, then standalone values.
EdgeAttribute:
    '[' (params+=EdgeAttributeValue (',' params+=EdgeAttributeValue)*)? ']'
    | (name=ID ':' value=EdgeAttributeValue ';'?)
    | (name=ID ';')
    | (text=EdgeAttributeValue)
;

// Edge styling annotation (e.g., @style("color: red; stroke-width: 4px") or @style(color: red; penwidth: 3;))
// Supports both string values and attribute-style parameters
EdgeAnnotation:
    '@' name=ID ('(' (value=STRING | attributes=AnnotationAttributes) ')')?
;

EdgeType:
    ((annotations+=EdgeAnnotation)*
    value+=EdgeAttribute+) | ((annotations+=EdgeAnnotation)+
    value+=EdgeAttribute*);

EdgeSegment:
    (sourceMultiplicity=STRING)?
    (
        // Bidirectional arrows
        endType=BIDIRECTIONAL_ARROW |
        endType=BIDIRECTIONAL_LABELED |
        // Inheritance, composition, aggregation
        endType=INHERIT_ARROW |
        endType=COMPOSE_ARROW |
        endType=AGGREGATE_ARROW |
        // Double dash arrows
        (startType=ARROW_LABEL_START_DOUBLE (label+=EdgeType (',' label+=EdgeType)*)? endType=ARROW_DOUBLE) |
        endType=ARROW_DOUBLE |
        // Fat arrows
        (startType=FAT_ARROW_LABEL_START (label+=EdgeType (',' label+=EdgeType)*)? endType=FAT_ARROW) |
        endType=FAT_ARROW |
        // Single dash arrows
        (startType=ARROW_LABEL_START_SINGLE (label+=EdgeType (',' label+=EdgeType)*)? endType=ARROW_SINGLE) |
        endType=ARROW_SINGLE
    )
    (targetMultiplicity=STRING)?
    (target+=[Node:QualifiedName] (',' target+=[Node:QualifiedName])*)
;


Edge<isRoot>:
    (<isRoot> (source+=[Node:QualifiedName] (',' source+=[Node:QualifiedName])*)?)
    segments+=EdgeSegment+ ';'?;
