import { useState } from "react";

type Piece = {
  symbol: string;
  isWhite: boolean;
};

type Position = { row: number; col: number };

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

const STARTING_POSITION = [
  [BLACK_ROOK, BLACK_KNIGHT, BLACK_BISHOP, BLACK_QUEEN, BLACK_KING, BLACK_BISHOP, BLACK_KNIGHT, BLACK_ROOK],
  [BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN, BLACK_PAWN],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN, WHITE_PAWN],
  [WHITE_ROOK, WHITE_KNIGHT, WHITE_BISHOP, WHITE_QUEEN, WHITE_KING, WHITE_BISHOP, WHITE_KNIGHT, WHITE_ROOK],
] as const;

const COL_LABELS = ["a", "b", "c", "d", "e", "f", "g", "h"];

function toAlgebraic(row: number, col: number): string {
  return `${COL_LABELS[col]}${8 - row}`;
}

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

function CapturedPieces({ pieces, label }: { pieces: Piece[]; label: string }) {
  return (
    <div className="flex items-center gap-2 min-h-[2rem]">
      <span className="text-xs text-stone-500 w-16">{label}</span>
      <div className="flex gap-1 flex-wrap">
        {pieces.length > 0 ? (
          pieces.map((piece, i) => (
            <span
              key={i}
              className={`text-lg ${piece.isWhite ? "text-white drop-shadow-md" : "text-stone-900"}`}
              style={{
                textShadow: piece.isWhite ? "0 1px 3px rgba(0,0,0,0.5)" : "0 1px 2px rgba(255,255,255,0.3)",
              }}
            >
              {piece.symbol}
            </span>
          ))
        ) : (
          <span className="text-stone-600 text-xs italic">None</span>
        )}
      </div>
    </div>
  );
}

function MoveHistory({ moves }: { moves: string[] }) {
  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <h3 className="text-sm font-medium text-stone-400 mb-2">Move History</h3>
      <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto">
        {moves.length === 0 ? (
          <span className="text-stone-600 text-sm italic">No moves yet</span>
        ) : (
          moves.map((move, i) => (
            <span key={i} className="text-sm text-stone-300 font-mono">
              {move}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function TurnIndicator({ isWhiteTurn }: { isWhiteTurn: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`
          w-4 h-4 rounded-full border-2 border-stone-600 transition-colors duration-200
          ${isWhiteTurn ? "bg-white" : "bg-stone-800"}
        `}
      />
      <span className="text-lg font-medium text-stone-100">
        {isWhiteTurn ? "White" : "Black"} to move
      </span>
    </div>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      onClick={onReset}
      className="
        px-4 py-2 bg-stone-700 hover:bg-stone-600
        text-stone-100 font-medium rounded-md
        transition-colors duration-150
        focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2 focus:ring-offset-stone-900
      "
    >
      Reset
    </button>
  );
}

function ChessBoard() {
  const [board, setBoard] = useState<(Piece | null)[][]>(STARTING_POSITION.map(row => [...row]));
  const [selected, setSelected] = useState<Position | null>(null);
  const [isWhiteTurn, setIsWhiteTurn] = useState(true);
  const [capturedByWhite, setCapturedByWhite] = useState<Piece[]>([]);
  const [capturedByBlack, setCapturedByBlack] = useState<Piece[]>([]);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);

  const handleReset = () => {
    setBoard(STARTING_POSITION.map(row => [...row]));
    setSelected(null);
    setIsWhiteTurn(true);
    setCapturedByWhite([]);
    setCapturedByBlack([]);
    setMoveHistory([]);
  };

  const handleSquareClick = (row: number, col: number) => {
    const piece = board[row][col];

    if (selected) {
      const fromPos = selected;
      const toPos = { row, col };

      if (fromPos.row !== toPos.row || fromPos.col !== toPos.col) {
        const movingPiece = board[fromPos.row][fromPos.col];
        if (movingPiece) {
          const capturedPiece = board[toPos.row][toPos.col];
          if (capturedPiece) {
            if (capturedPiece.isWhite) {
              setCapturedByBlack([...capturedByBlack, capturedPiece]);
            } else {
              setCapturedByWhite([...capturedByWhite, capturedPiece]);
            }
          }

          const moveNum = Math.floor(moveHistory.length / 2) + 1;
          const turnPrefix = moveHistory.length % 2 === 0 ? `${moveNum}.` : "";
          const from = toAlgebraic(fromPos.row, fromPos.col);
          const to = toAlgebraic(toPos.row, toPos.col);
          setMoveHistory([...moveHistory, `${turnPrefix} ${from}-${to}`]);
        }
      }

      if (piece) {
        setSelected({ row, col });
        setIsWhiteTurn(!isWhiteTurn);
      } else {
        setSelected(null);
      }
    } else if (piece) {
      setSelected({ row, col });
      setIsWhiteTurn(!isWhiteTurn);
    }
  };

  const isSelected = (row: number, col: number) =>
    selected?.row === row && selected?.col === col;

  return (
    <div className="flex items-start gap-8">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-6">
          <TurnIndicator isWhiteTurn={isWhiteTurn} />
          <ResetButton onReset={handleReset} />
        </div>
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

        <div className="flex flex-col gap-1 px-4 py-3 bg-stone-800/50 rounded-lg min-w-[300px]">
          <CapturedPieces pieces={capturedByWhite} label="White took" />
          <CapturedPieces pieces={capturedByBlack} label="Black took" />
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

      <MoveHistory moves={moveHistory} />
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