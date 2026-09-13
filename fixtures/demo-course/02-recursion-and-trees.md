# Lecture 2 — Recursion and Trees

## Recursion

A recursive function is one that calls itself on a smaller version of the same
problem. Every correct recursive function has two parts: a base case that stops
the recursion, and a recursive step that makes progress toward that base case.

## Base Case

The base case is the input small enough to answer directly, without recursing.
Forgetting it, or writing one that is never reached, causes infinite recursion
and a stack overflow. When a recursive function misbehaves, the base case is the
first thing to check.

Understanding recursion requires understanding the base case first — you cannot
reason about whether a recursive function terminates without identifying what
stops it.

## Trees

A tree is a hierarchical structure of nodes, each with a value and a list of
children, and exactly one node with no parent — the root. A node with no children
is a leaf. Trees are defined recursively: each child of a node is itself the root
of a smaller subtree. Understanding trees therefore depends on being comfortable
with recursion, because almost every tree operation is expressed recursively.

## Binary Search Trees

A binary search tree is a tree in which each node has at most two children, and
every node satisfies the ordering property: all values in its left subtree are
smaller than the node, and all values in its right subtree are larger.

This is the same idea as binary search, but stored as a structure rather than
performed on an array. Searching one means comparing the target to the current
node and descending left or right, discarding an entire subtree at each step.

Be careful not to confuse a binary search tree with binary search itself. Binary
search is a procedure you run on a sorted array; a binary search tree is a data
structure that maintains its ordering as items are inserted and removed. They
share an idea but they are not the same thing.

## Tree Traversal

Traversal means visiting every node exactly once. In-order traversal visits the
left subtree, then the node, then the right subtree. Applied to a binary search
tree, in-order traversal produces the values in sorted order, which is a direct
consequence of the ordering property above.

All traversals are naturally recursive: visit a subtree by applying the same
traversal to it.
