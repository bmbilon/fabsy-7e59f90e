import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('query',Path(__file__).with_name('query.py'))
query = importlib.util.module_from_spec(spec)
spec.loader.exec_module(query)


class QueryTests(unittest.TestCase):
    def test_only_bounded_integer_pagination_changes(self):
        original = query.build_query()
        page = query.build_query(offset=50,limit=25)
        expected = original.replace('/* automation_batch_limit */ 50::integer',
                                    '/* automation_batch_limit */ 25::integer').replace(
                                    '/* automation_batch_offset */ 0::integer',
                                    '/* automation_batch_offset */ 50::integer')
        self.assertEqual(page,expected)
        self.assertTrue(page.startswith('BEGIN READ ONLY;'))

    def test_invalid_and_injected_pagination_is_rejected(self):
        for offset,limit in [(-1,50),(0,0),(0,51),(0,'1; delete from clients'),('0',50),(True,50)]:
            with self.assertRaises(ValueError):
                query.build_query(offset,limit)


if __name__ == '__main__':
    unittest.main()
