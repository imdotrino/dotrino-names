"""Genera src/words/{adjectives,nouns}.js desde la lista del dueño (seyacat/dns, carpeta en/).

Uso: python3 -I scripts/build-words.py /mnt/sda1/dns/en
Criterio (docs/DISENO.md §5.1): popularidad >= 7, categoría del diccionario, solo a-z, 3-10 letras,
fuera lo de src/words/exclude.json y los plurales. La salida va ordenada para que el diff sea legible.
"""
import glob, json, os, re, sqlite3, sys

src = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'src', 'words')
exclude = set(json.load(open(os.path.join(out, 'exclude.json'))))

score = {}
for f in glob.glob(os.path.join(src, 'simple_words', 'score_*.txt')):
    for line in open(f, encoding='utf-8'):
        if line.startswith('#') or not line.strip():
            continue
        parts = line.split()
        try:
            score[' '.join(parts[:-1])] = int(parts[-1])
        except ValueError:
            pass

db = sqlite3.connect(os.path.join(src, 'english_dictionary.db'))
pos = {}
for word, tag in db.execute('select w.word, p.tag from words w join word_pos wp on wp.word_id = w.id join pos_tags p on p.id = wp.pos_id'):
    pos.setdefault(word, set()).add(tag)

ok = re.compile(r'^[a-z]{3,10}$')
def pick(tag):
    words = {w for w, s in score.items() if s >= 7 and ok.match(w) and tag in pos.get(w, ()) and w not in exclude}
    # Sin plurales: `cats` sobra si ya está `cat` (y `boxes` si está `box`).
    def plural(w):
        return (w.endswith('s') and w[:-1] in words) or (w.endswith('es') and w[:-2] in words) or (w.endswith('ies') and w[:-3] + 'y' in words)
    return sorted(w for w in words if not plural(w))

for name, tag in (('adjectives', 'adj'), ('nouns', 'noun')):
    words = pick(tag)
    # Un módulo JS y no un .json: así lo importan igual Node, el navegador y cualquier empaquetador.
    with open(os.path.join(out, name + '.js'), 'w') as fh:
        fh.write('// Generado por scripts/build-words.py: no se edita a mano.\n')
        fh.write('export default Object.freeze(' + json.dumps(words) + ')\n')
    print(name, len(words))
