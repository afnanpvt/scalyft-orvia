// Splits streamed LLM text into whole sentences for TTS. Whole sentences keep the
// intonation natural; comma-sized fragments sound robotic.
//
// A terminator only counts when followed by whitespace or the end of the text, so
// "2.30" and "Dr.Rao" don't split. Pieces shorter than `min` are merged into the next.

function makeSplitter(emit, { min = 10 } = {}) {
  let buf = "";
  const END = /([.!?।…]+["'”’)\]]*)(\s+|$)/g;

  function drain(final) {
    let start = 0;
    let m;
    END.lastIndex = 0;
    while ((m = END.exec(buf))) {
      const end = m.index + m[1].length;
      // At the very end of the buffer, more punctuation or text may still arrive.
      if (!final && m[2] === "") break;
      const piece = buf.slice(start, end).trim();
      if (piece.length >= min) {
        emit(piece);
        start = end + m[2].length;
      }
    }
    buf = buf.slice(start);
    if (final && buf.trim()) {
      emit(buf.trim());
      buf = "";
    }
  }

  return {
    push(text) {
      buf += text;
      drain(false);
    },
    flush() {
      drain(true);
    },
  };
}

// Markdown and symbols a speech engine would read out loud.
function speakable(text) {
  return String(text || "")
    .replace(/[*_`#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { makeSplitter, speakable };
