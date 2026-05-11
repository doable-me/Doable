const BOARD_SIZE = 8;

type Piece = {
  symbol: string;
  isWhite: boolean;
};

type Row = (Piece | null)[][];

// Unicode chess pieces
const WHITE_KING = { symbol: "♔", isWhite: true };
const WHITE_QUEEN = { symbol: "♕", isWhite: true };
const WHITE_ROOK = { symbol: "♖", isWhite: true };
const WHITE_BISHOP = { symbol: "♗", isWhite: true };
const WHITE_KNIGHT = { symbol: "♘", isWhite: true };
const WHITE_PAWN = { symbol: "♙", isWhite: true };
const BLACK_KING = { symbol: "♚", isWhite: false };
const BLACK_QUEEN = { symbol: "♛", isWhite: false };
const BLACK_ROOK = { symbol: "♜", isWhite: false };
const BLACK_BISHOP = { symbol: "♝", isWhite: false };
const BLACK_KNIGHT = { symbol: "♞", isWhite: false };
const BLACK_PAWN = { symbol: "♟", isWhite: false };

// Starting position - row 0 = rank 8 (black's back rank), row 7 = rank 1 (white's back rank)
// Column 0 = file a, column 7 = file h
const startingPosition: Row = [
  // Rank 8 (Black back rank)
  [BLACK_ROOK, BLACK_KNIGHT, BLACK_BISHOP, BLACK_QUEEN, BLACK_KING, BLACK_BISHOP, BLACK_KNIGHT, BLACK_ROOK],
  // Rank 7 (Black pawns)
  [BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN],
  // Ranks 6-2 (empty)
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  // Rank 1 (White pawns)
  [WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN],
  // Rank 1 (White back rank)
  [WHITE_ROOK, WHITE_KNIGHT, WHITE_BISHOP, WHITE_QUEEN, WHITE_KING, WHITE_BISHOP, WHITE_KNIGHT, WHITE_ROOK],
];

function Square({ piece, isLight }: { piece: Piece | null; isLight: boolean }) {
  return (
    <div
      className={`
        aspect-square flex items-center justify-center
        text-3xl sm:text-4xl md:text-5xl lg:text-6xl
        transition-colors select-none
        ${isLight ? "bg-[#f0d9b5]" : "bg-[#b58863]"}
      `}
    >
      {piece && (
        <span
          className={`
            drop-shadow-md
            ${piece.isWhite ? "text-white" : "text-stone-900"}
          `}
          style={{ textShadow: piece.isWhite ? "0 1px 3px rgba(0,0,0,0.5)" : "0 1px 2px rgba(255,255,255,0.3)" }}
        >
          {piece.symbol}
        </span>
      )}
    </div>
  );
}

function ChessBoard() {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Board container with frame */}
      <div className="p-3 bg-[#854d0e] rounded-lg shadow-2xl">
        <div className="grid grid-cols-8 rounded overflow-hidden shadow-inner">
          {startingPosition.map((row, rowIndex) =>
            row.map((piece, colIndex) => {
              const isLight = (rowIndex + colIndex) % 2 === 0;
              return (
                <Square
                  key={`${rowIndex}-${colIndex}`}
                  piece={piece}
                  isLight={isLight}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-8 text-sm text-stone-400">
        <div className="flex items-center gap-2">
          <span className="text-2xl text-white drop-shadow-md" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>♔♕♖♗♘♙</span>
          <span>White</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl text-stone-900">♚♛♜♝♞♟</span>
          <span>Black</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-stone-900 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold text-stone-100 mb-8 tracking-wide">
        Chess
      </h1>
      <ChessBoard />
    </div>
  );
}