import { describe, expect, it } from '@jest/globals';
import { parseCembed } from '../../src/utils/parseCembed.js';

describe('parseCembed', () => {
  it('joins a joinStr description instead of dropping it', () => {
    const code = `{{ $e := cembed
    "title" "Rule 2"
    "description" (joinStr "\\n\\n"
        "<@123>"
        "**No piracy:**\\n> *\\"no 'where to watch' questions\\"*"
        "**Tread carefully.**"
    )
    "footer" (sdict "text" "Moderation")
}}`;
    expect(parseCembed(code)).toEqual({
      title: 'Rule 2',
      description: '<@123>\n\n**No piracy:**\n> *"no \'where to watch\' questions"*\n\n**Tread carefully.**',
      footer: { text: 'Moderation' },
    });
  });
});
