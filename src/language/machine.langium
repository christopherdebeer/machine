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
terminal ID: /[A-Za-z_0-9][A-Za-z0-9_.]*/;              // identifiers for class and attribute names
terminal STR: /"([^"\\]|\\.)*"/;        // double-quoted strings for titles and default values
terminal MLSTR: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;  // multiline strings
terminal NUMBER returns number: /[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/;

terminal EXTID: /#([A-Za-z0-9_][A-Za-z0-9_]*)/;

terminal SHAFT_THIN: '-';
terminal SHAFT_THICK: '=';
terminal SHAFT_DOT: '.';

terminal LEFT_ARROW: '<';
terminal RIGHT_ARROW: '>';
terminal LOLIPOP: '()';

terminal SHAFT:
    (SHAFT_THIN | SHAFT_THICK | SHAFT_DOT)+
;

ArrowHead:
    left?=(LEFT_ARROW | LOLIPOP) SHAFT+ right?=(RIGHT_ARROW | LOLIPOP)
;

STRING returns string: STR | MLSTR;

entry Machine:
    'machine' title=STRING
    (annotations+=Annotation)*
    (nodes+=Node<true> | edges+=Edge<true> | notes+=Note)*
;

AttributeValue:
    ('[' (value+=(EXTID|STRING|ID|NUMBER) (',' value+=(EXTID|STRING|ID|NUMBER))*)? ']')
    | value=EXTID|STRING|ID|NUMBER;

// Annotation for machines and nodes (e.g., @strictMode, @Abstract, @Singleton, @Deprecated)
Annotation:
    '@' name=ID ('(' value=STRING ')')?
;

// Note attached to a node for documentation
Note:
    'note' 'for' target=[Node:ID] content=STRING
;

// Type definition that supports generic types (e.g., Promise<Result>, List<Step>)
TypeDef:
    base=ID ('<' generics+=TypeDef (',' generics+=TypeDef)* '>')?
;

Attribute:
name=ID ('<' type=TypeDef '>')? (':' value=AttributeValue)? ';'
;

Node<isRoot>:
    (<isRoot> type=ID)?
    name=ID
    (title=STRING)?
    (annotations+=Annotation)*
    (('{'
        (nodes+=Node<true> | edges+=Edge<true> | attributes+=Attribute)*
    '}' ';'?) | ';')
;

EdgeAttributeValue returns string: EXTID|STRING|ID|NUMBER;

EdgeAttribute:
    (name=ID (':' value=EdgeAttributeValue)? ';'?)
    | (text=EdgeAttributeValue)
    | '[' (params+=EdgeAttributeValue (',' params+=EdgeAttributeValue)*)? ']'
;

// Edge styling annotation (e.g., @style("color: red; stroke-width: 4px"))
EdgeAnnotation:
    '@' name=ID ('(' value=STRING ')')?
;

EdgeType:
    (annotations+=EdgeAnnotation)*
    value+=EdgeAttribute+;

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
    (target+=[Node:ID] (',' target+=[Node:ID])*)
;


Edge<isRoot>:
    (<isRoot> (source+=[Node:ID] (',' source+=[Node:ID])*)?)
    segments+=EdgeSegment+ ';';
