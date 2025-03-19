grammar Machine
// Hidden terminals for whitespace and comments
hidden terminal WS: /\s+/;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;

// Basic terminals
terminal ID: /[A-Za-z_0-9][A-Za-z0-9_]*/;              // identifiers for class and attribute names
terminal STR: /"([^"\\]|\\.)*"/;        // double-quoted strings for titles and default values
terminal MLSTR: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;  // multiline strings
terminal INT returns number: /[0-9]+/;         // integer numbers for numeric values

terminal BASICTYPE: "string" | "number" | "boolean";
terminal EXTID: /#([A-Za-z0-9_][A-Za-z0-9_]*)/;

STRING returns string: STR | MLSTR;


entry Machine:
    'machine' title=STRING
    (nodes+=Node<true>)*
    (edges+=Edge<true>)*
;


AttributeValue returns string: EXTID|STRING|ID|INT;

Attribute:
    name=ID ('<' type=ID '>')? ':' (value=AttributeValue)? ';'
;

Node<isRoot>:
	(<isRoot> type=ID)? 
	name=ID ('{'
		nodes+=(Node<false>)*
        attributes+=Attribute*
	'}')? ';';

EdgeStart returns string: '--';
EdgeEnd returns string: '-->';

EdgeSegment:
    startType=EdgeStart
    (label=(EXTID|STRING|ID|INT|BASICTYPE))?
    endType=EdgeEnd
    target=[Node:ID]
;

Edge<isRoot>:
    (<isRoot> source=[Node:ID])
    segments+=EdgeSegment+ ';'
;
