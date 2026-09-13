# Lecture 3 — Complexity

## Big-O Notation

Big-O notation, also written asymptotic complexity, describes how an algorithm's
cost grows as its input grows. It deliberately ignores constant factors and
lower-order terms, because those are dwarfed by growth rate once the input is
large enough.

Some people write "order of growth" or just "Big O" — these all mean the same
thing.

## Applying Big-O to Search

Linear search is O(n): doubling the array roughly doubles the work. Binary search
is O(log n): doubling the array adds just one extra comparison, because each step
halves the range. This is why the sorted-ordering precondition is usually worth
paying for — you sort once and then search many times cheaply.

Searching a balanced binary search tree is also O(log n), for the same halving
reason. An unbalanced one degrades to O(n), because it behaves like a list.

## Hash Tables

A hash table stores key-value pairs and uses a hash function to compute where a
key belongs, giving average-case O(1) lookup. Hash tables do not require sorted
ordering and do not support in-order traversal, which makes them a different
tool rather than a strictly better one.

This topic is covered in Unit 4 and is not part of the Unit 1–3 exam.
