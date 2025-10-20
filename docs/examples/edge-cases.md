
### `edge-cases-collection.dygram`

Edge Cases Collection

```dygram examples/edge-cases/edge-cases-collection.dygram
machine "Edge Cases Collection"
empty;
singleChar {
    a: "x";
}

multipleEdges;
target1;
target2;
target3;

multipleEdges -> target1;
multipleEdges -> target2;
multipleEdges -> target3;

target1 -> target2 -> target3 -> empty;
```

### `special-characters.dygram`

Special Characters Test 🚀

```dygram examples/edge-cases/special-characters.dygram
machine "Special Characters Test 🚀"
node_with_underscores;
nodeWithSpaces;
node123;
_privateNode;

node_with_underscores -> nodeWithSpaces;
nodeWithSpaces -"transition: with-dashes"-> node123;
node123 -"emoji: 🎉"-> _privateNode;
```
