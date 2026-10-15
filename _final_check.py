import json, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
web = json.load(open('web/books_data.json'))
wb = web['books'] if isinstance(web, dict) and 'books' in web else web
print('前端条数:', len(wb))
db = json.load(open('data/douban_books.json'))
books = db['books'] if isinstance(db, dict) and 'books' in db else db
books = list(books.values()) if isinstance(books, dict) else books
print('库内总条目:', len(books))
print('有简介:', sum(1 for b in books if b.get('d')))
print('有星级分布:', sum(1 for b in books if b.get('dist')))
print('有摘录:', sum(1 for b in books if b.get('quotes')))
print('有出版年月:', sum(1 for b in books if b.get('ym')))
tl = {}
for b in books:
    for k in (b.get('charts') or {}):
        tl[k] = tl.get(k, 0) + 1
print('月榜:', dict(sorted(tl.items())))
thousand = [b for b in books if (b.get('v') or 0) >= 1000 and b.get('rated')]
print('千人评价以上:', len(thousand), '| 其中已有摘录:', sum(1 for b in thousand if b.get('quotes')))
print('千人评价但无摘录:', sum(1 for b in thousand if not b.get('quotes')))
