# Deep Nested (5 levels)

## Source
```machine
machine "Deep Nested Machine"
level1 {
    level2 {
        level3 {
            level4 {
                level5a;
                level5b;
            }
        }
    }
}
```

## Mermaid Output
```mermaid
---
"title": "Deep Nested Machine"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
    class level1 {
    
  }

  class level2 {
    <<level1>>
  }
    class level3 {
      <<level2>>
    }
      class level4 {
        <<level3>>
      }
      namespace level4s {
        class level5a {
          <<level4>>
        }

        class level5b {
          <<level4>>
        }
      }
  undefined

```

## JSON Output
```json
{
  "title": "Deep Nested Machine",
  "nodes": [
    {
      "name": "level1",
      "attributes": []
    },
    {
      "name": "level2",
      "type": "level1",
      "attributes": []
    },
    {
      "name": "level3",
      "type": "level2",
      "attributes": []
    },
    {
      "name": "level4",
      "type": "level3",
      "attributes": []
    },
    {
      "name": "level5a",
      "type": "level4",
      "attributes": []
    },
    {
      "name": "level5b",
      "type": "level4",
      "attributes": []
    }
  ],
  "edges": []
}
```

## Validation Status
- Passed: true
- Parse Errors: 0
- Transform Errors: 0
- Completeness Issues: 0
- Losslessness Issues: 0
- Mermaid Parse Errors: 0
