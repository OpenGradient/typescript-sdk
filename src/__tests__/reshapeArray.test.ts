import { reshapeArray } from "../utils";

describe("reshapeArray", () => {
  it("should return the flat array as-is for a 1D shape", () => {
    const flat = [1, 2, 3, 4, 5];
    const result = reshapeArray(flat, [5]);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("should reshape a flat array into a 2D array with shape [2, 3]", () => {
    const flat = [1, 2, 3, 4, 5, 6];
    const result = reshapeArray(flat, [2, 3]);
    expect(result).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it("should reshape a flat array into a 3D array with shape [2, 3, 4]", () => {
    // This is the critical case that was broken before the fix.
    // shape.slice(0, -1) would have passed [2, 3] instead of [3, 4],
    // causing silent data corruption.
    const flat = Array.from({ length: 24 }, (_, i) => i + 1);
    const result = reshapeArray(flat, [2, 3, 4]);
    expect(result).toEqual([
      [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
      ],
      [
        [13, 14, 15, 16],
        [17, 18, 19, 20],
        [21, 22, 23, 24],
      ],
    ]);
  });

  it("should reshape a flat array into a 4D array with shape [2, 2, 2, 3]", () => {
    const flat = Array.from({ length: 24 }, (_, i) => i + 1);
    const result = reshapeArray(flat, [2, 2, 2, 3]);
    expect(result).toEqual([
      [
        [
          [1, 2, 3],
          [4, 5, 6],
        ],
        [
          [7, 8, 9],
          [10, 11, 12],
        ],
      ],
      [
        [
          [13, 14, 15],
          [16, 17, 18],
        ],
        [
          [19, 20, 21],
          [22, 23, 24],
        ],
      ],
    ]);
  });

  it("should handle a single-element shape [1, 1, 1]", () => {
    const flat = [42];
    const result = reshapeArray(flat, [1, 1, 1]);
    expect(result).toEqual([[[42]]]);
  });

  it("should return the array unchanged when shape is empty", () => {
    const flat = [1, 2, 3];
    const result = reshapeArray(flat, []);
    expect(result).toEqual([1, 2, 3]);
  });
});
