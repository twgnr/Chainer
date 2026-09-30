import unittest

from record_fixtures import MAX_ITEMS, shrink_list, shrink_tron_account


class ShrinkListTests(unittest.TestCase):
    def test_truncates_root_list(self):
        items = list(range(MAX_ITEMS + 2))
        self.assertEqual(shrink_list(None)(items), items[:MAX_ITEMS])

    def test_clears_pagination_after_truncating(self):
        value = {"items": list(range(MAX_ITEMS + 1)), "next_page_params": {"page": 2}}
        result = shrink_list("items")(value)
        self.assertEqual(result["items"], value["items"][:MAX_ITEMS])
        self.assertIsNone(result["next_page_params"])

    def test_keeps_pagination_when_list_is_not_truncated(self):
        value = {"items": [1], "next_page_params": {"page": 2}}
        self.assertEqual(shrink_list("items")(value), value)


class ShrinkTronAccountTests(unittest.TestCase):
    def test_truncates_accounts_and_large_token_lists(self):
        account = {
            "data": [
                {"trc20": list(range(MAX_ITEMS + 1)), "balance": 123},
                *({"balance": index} for index in range(MAX_ITEMS)),
            ]
        }
        result = shrink_tron_account(account)
        self.assertEqual(len(result["data"]), MAX_ITEMS)
        self.assertEqual(len(result["data"][0]["trc20"]), MAX_ITEMS)
        self.assertEqual(result["data"][0]["balance"], 123)

    def test_leaves_non_account_payloads_unchanged(self):
        payload = {"data": "not-an-account-list"}
        self.assertIs(shrink_tron_account(payload), payload)


if __name__ == "__main__":
    unittest.main()
