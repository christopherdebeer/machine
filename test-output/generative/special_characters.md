# Special Characters

## Source
```machine
machine "Special Characters Test 🚀"
node_with_underscores;
nodeWithSpaces;
node123;
_privateNode;

node_with_underscores -> nodeWithSpaces;
nodeWithSpaces -"transition: with-dashes"-> node123;
node123 -"emoji: 🎉"-> _privateNode;
```

## Mermaid Output
```mermaid
---
"title": "Special Characters Test 🚀"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
    class node_with_underscores {
    
  }

  class nodeWithSpaces {
    
  }

  class node123 {
    
  }

  class _privateNode {
    
  }
    node_with_underscores --> nodeWithSpaces

  nodeWithSpaces --> node123 : transition: with-dashes

  node123 --> _privateNode : emoji: 🎉
  
  

```

## JSON Output
```json
{
  "title": "Special Characters Test 🚀",
  "nodes": [
    {
      "name": "node_with_underscores",
      "attributes": []
    },
    {
      "name": "nodeWithSpaces",
      "attributes": []
    },
    {
      "name": "node123",
      "attributes": []
    },
    {
      "name": "_privateNode",
      "attributes": []
    }
  ],
  "edges": [
    {
      "source": "node_with_underscores",
      "target": "nodeWithSpaces",
      "arrowType": "->"
    },
    {
      "source": "nodeWithSpaces",
      "target": "node123",
      "value": {
        "text": "transition: with-dashes"
      },
      "attributes": {
        "text": "transition: with-dashes"
      },
      "arrowType": "->"
    },
    {
      "source": "node123",
      "target": "_privateNode",
      "value": {
        "text": "emoji: 🎉"
      },
      "attributes": {
        "text": "emoji: 🎉"
      },
      "arrowType": "->"
    }
  ],
  "notes": [],
  "inferredDependencies": []
}
```

## Validation Status
- Passed: true
- Parse Errors: 0
- Transform Errors: 0
- Completeness Issues: 0
- Losslessness Issues: 0
- Mermaid Parse Errors: 0
