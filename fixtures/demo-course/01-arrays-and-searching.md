# Lecture 1 — Arrays and Searching

## Array Indexing

An array stores elements in one contiguous block of memory. Because every element
occupies the same number of bytes, the address of element `i` can be computed
directly as `base_address + i * element_size`. This is why reading `a[i]` takes
constant time no matter how large the array is, and it is the property every
searching algorithm in this unit depends on.

You must understand array indexing before anything else in this lecture. If you
cannot jump to an arbitrary position in constant time, the halving trick behind
binary search does not work at all.

## Sorted Ordering

A sequence is sorted when, for every adjacent pair, the earlier element is less
than or equal to the later one. Sorting is not itself a search technique, but it
is a precondition for the fast searches below. Sorted ordering is what lets you
conclude something about elements you have never examined: if the midpoint is
larger than your target, every element to its right must also be larger.

Note that sorted ordering requires array indexing to be useful here — we rely on
being able to inspect the middle element directly rather than walking the list.

## Linear Search

Linear search examines each element from left to right until it finds the target
or reaches the end. It makes no assumptions: the data does not need to be sorted.
The cost is proportional to the number of elements, so on a list of one million
entries you may perform one million comparisons.

## Binary Search

Binary search finds a target in a sorted array by repeatedly discarding half of
the remaining search space. It requires that the array already be sorted, and it
requires constant-time indexing to jump to the midpoint.

The procedure is as follows:

1. **Choose the midpoint.** Set `low` to the first index and `high` to the last.
   Compute `mid = low + (high - low) / 2`. Writing it this way rather than
   `(low + high) / 2` avoids integer overflow on very large arrays.
2. **Compare the target to the midpoint value.** If they are equal, you are done
   and you return `mid`. This comparison is the only place the target value is
   actually examined.
3. **Keep one half.** If the target is smaller than the midpoint value, discard
   the right half by setting `high = mid - 1`. If it is larger, discard the left
   half by setting `low = mid + 1`. Repeat from step 1 until `low > high`, which
   means the target is not present.

Each iteration halves the remaining range, so the number of comparisons grows
very slowly as the array gets bigger. This produces a much smaller search range
on every pass, which is the whole point of the technique.

A worked example: searching for 23 in `[4, 8, 15, 16, 23, 42]`. The midpoint is
15, which is smaller than 23, so the left half is discarded. The midpoint of the
remainder is 23, and the search returns immediately.
