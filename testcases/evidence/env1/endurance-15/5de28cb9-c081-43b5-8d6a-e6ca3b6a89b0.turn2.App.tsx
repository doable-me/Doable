import { useState } from "react";

type Piece = {
  symbol: string;
  isWhite: boolean;
};

type Position = { row: number; col: number };

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

// Starting position
const createStartingPosition = () => [
  [BLACK_ROOK, BLACK_KNIGHT, BLACK_BISHOP, BLACK_QUEEN, BLACK_KING, BLACK_BISHOP, BLACK_KNIGHT, BLACK_ROOK],
  [BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN],
  [WHITE_ROOK, WHITE_KNIGHT, WHITE_BISHOP, WHITE_QUEEN, WHITE_KING, WHITE_BISHOP, WHITE_KNIGHT, WHITE_ROOK],
];

function Square({
  piece,
  isLight,
  isSelected,
  onClick,
}: {
  piece: Piece | null;
  isLight: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const baseBg = isLight ? "bg-[#f0d9b5]" : "bg-[#b58863]";
  const selectedBg = "bg-yellow-400";

  return (
    <button
      onClick={onClick}
      className={`
        aspect-square flex items-center justify-center
        text-3xl sm:text-4xl md:text-5xl lg:text-6xl
        transition-all duration-150 select-none cursor-pointer
        border border-transparent
        ${isSelected ? selectedBg : baseBg}
        hover:brightness-110
        focus:outline-none focus:ring-2 focus:ring-yellow-300 focus:ring-inset
      `}
    >
      {piece && (
        <span
          className={`
            drop-shadow-md transition-transform
            ${piece.isWhite ? "text-white" : "text-stone-900"}
            ${isSelected ? "scale-110" : ""}
          `}
          style={{
            textShadow: piece.isWhite
              ? "0 1px 3px rgba(0,0,0,0.5)"
              : "0 1px 2px rgba(255,255,255,0.3)",
          }}
        >
          {piece.symbol}
        </span>
      )}
    </button>
  );
}

function ChessBoard() {
  const [board] = useState(createStartingPosition);
  const [selected, setSelected] = useState<Position | null>(null);

  const handleSquareClick = (row: number, col: number) => {
    const piece = board[row][col];
    if (piece) {
      setSelected({ row, col });
    } else {
      setSelected(null);
    }
  };

  const isSelected = (row: number, col: number) =>
    selected?.row === row && selected?.col === col;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="p-3 bg-[#854d0e] rounded-lg shadow-2xl">
        <div className="grid grid-cols-8 rounded overflow-hidden shadow-inner">
          {board.map((row, rowIndex) =>
            row.map((piece, colIndex) => (
              <Square
                key={`${rowIndex}-${colIndex}`}
                piece={piece}
                isLight={(rowIndex + colIndex) % 2 === 0}
                isSelected={isSelected(rowIndex, colIndex)}
                onClick={() => handleSquareClick(rowIndex, colIndex)}
              />
            ))
          )}
        </div>
      </div>

      <div className="flex gap-8 text-sm text-stone-400">
        <div className="flex items-center gap-2">
          <span className="text-2xl text-white drop-shadow-md">♔♕♖♗♘♙</span>
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
      <h1 className="text-2xl font-bold text-stone-100 mb-8 tracking-wide">Chess</h1>
      <ChessBoard />
    </div>
  );
}