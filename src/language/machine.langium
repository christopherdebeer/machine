grammar Machine
// Hidden terminals for whitespace and comments
hidden terminal WS: /\s+/;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;

// Basic terminals
terminal ID: /[A-Za-z_0-9][A-Za-z0-9_.]*/;              // identifiers for class and attribute names
terminal STR: /"([^"\\]|\\.)*"/;        // double-quoted strings for titles and default values
terminal MLSTR: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;  // multiline strings
terminal INT returns number: /[0-9]+/;         // integer numbers for numeric values

terminal EXTID: /#([A-Za-z0-9_][A-Za-z0-9_]*)/;

// Arrow terminals - ordered from most specific to least specific
terminal BIDIRECTIONAL_ARROW: '<-->';
terminal BIDIRECTIONAL_LABELED: /<--[a-zA-Z0-9_]+-?-?>/;
terminal ARROW_DOUBLE: '-->';
terminal ARROW_LABEL_START_DOUBLE: '--';
terminal FAT_ARROW: '=>';
terminal FAT_ARROW_LABEL_START: '=';
terminal ARROW_SINGLE: '->';
terminal ARROW_LABEL_START_SINGLE: '-';

STRING returns string: STR | MLSTR;


entry Machine:
    'machine' title=STRING
    (nodes+=Node<true>)*
    (edges+=Edge<true>)*
;


AttributeValue returns string: EXTID|STRING|ID|INT;

Attribute:
    name=ID ('<' type=ID '>')? (':' value=AttributeValue)? ';'
;

Node<isRoot>:
    (<isRoot> type=ID)? 
    name=ID 
    (title=STRING)?
    ('{' 
        attributes+=Attribute*
        (nodes+=Node<false>)*
        (edges+=Edge<false>)*
    '}' | ';')
;


EdgeAttributeValue returns string: EXTID|STRING|ID|INT;

EdgeAttribute:
    name=ID (':' value=EdgeAttributeValue)? ';'?
;

EdgeType:
    value+=EdgeAttribute+;

EdgeSegment:
    (
        // Bidirectional arrows
        endType=BIDIRECTIONAL_ARROW |
        endType=BIDIRECTIONAL_LABELED |
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
    (target+=[Node:ID] (',' target+=[Node:ID])*)
;

Edge<isRoot>:
    (<isRoot> (source+=[Node:ID] (',' source+=[Node:ID])*)?)
    segments+=EdgeSegment+ ';';
