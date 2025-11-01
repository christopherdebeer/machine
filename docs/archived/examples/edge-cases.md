
### `edge-cases-collection.dygram`

Edge Cases Collection

```dy examples/edge-cases/edge-cases-collection.dygram
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

```dy examples/edge-cases/special-characters.dygram
machine "Special Characters Test 🚀"
node_with_underscores;
nodeWithSpaces;
node123;
_privateNode;

node_with_underscores -> nodeWithSpaces;
nodeWithSpaces -"transition: with-dashes"-> node123;
node123 -"emoji: 🎉"-> _privateNode;
```


### `interleaved.dygram`

Interleaved nodes, edges and attributes (including at root)

```dy examples/edge-cases/interleaved.dygram
machine "Interleaved attributes, nodes and edges" @Example("foo")

four: 1

one -> two;

problem "The Problem...";

two -> one;

solution @best;

problem -> solution;

one; two;

three: "foo";

parent {
    test: true;

    child1;
    child2;
    the_third {
        title: "foo"
        fourth;
    }

    -> solution;
}
```