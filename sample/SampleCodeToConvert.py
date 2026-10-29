# Upload each file to get a file_id:
#   files.create(
#       file=open("InvoiceSchema.txt", "rb"),
#       purpose="user_data",
#   )
#
# The input attachment blocks below reference ids minted for this session:
#   file-1430016725993320  InvoiceSchema.txt
#   file-1647392890168633  844707.pdf
# swap in the ids your own uploads return.

import os
import requests

api_key = os.environ.get("MODEL_API_KEY")
url = "https://api.meta.ai/v1/responses"

headers = {
  "Authorization": f"Bearer {api_key}",
  "Content-Type": "application/json",
  "Accept": "text/event-stream",
}

payload = {
  "model": "muse-wonder-1.0",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "convert attached pdf into json using InvoiceSchema",
        },
        {
          "type": "input_file",
          "file_id": "file-1430016725993320",
        },
        {
          "type": "input_file",
          "file_id": "file-1647392890168633",
        },
      ],
    },
    {
      "role": "assistant",
      "content": "```json\n{\n  \"AmountDue\": 780.49,\n  \"BillingAddress\": \"BOX 1333, MINNEAPOLIS, MN 55440-1333\",\n  \"BillingAddressRecipient\": \"MORTENSON CO, M A\",\n  \"CustomerAddress\": \"BOX 1333, MINNEAPOLIS, MN 55440-1333\",\n  \"CustomerAddressRecipient\": \"MORTENSON CO, M A\",\n  \"CustomerId\": \"46520020\",\n  \"CustomerName\": \"MORTENSON CO, M A\",\n  \"CustomerTaxId\": null,\n  \"DueDate\": \"02/15/2026\",\n  \"InvoiceDate\": \"01/22/26\",\n  \"InvoiceId\": \"844707\",\n  \"InvoiceTotal\": 780.49,\n  \"PaymentTerm\": \"15TH OF FOLLOWING MO\",\n  \"PreviousUnpaidBalance\": null,\n  \"PurchaseOrder\": null,\n  \"RemittanceAddress\": null,\n  \"RemittanceAddressRecipient\": null,\n  \"ShippingAddress\": \"ABBOTT NORTHWESTERN, 800 E. 28TH ST, MPLS, MN\",\n  \"ShippingAddressRecipient\": \"MORTENSON CO, M A\",\n  \"ShippingCost\": null,\n  \"Subtotal\": 714.40,\n  \"TotalTax\": 66.09,\n  \"TotalVAT\": null,\n  \"VendorAddress\": \"3096 RICE ST, LITTLE CANADA, MN 55113\",\n  \"VendorAddressRecipient\": \"KATH FUEL OIL SERVICE CO\",\n  \"VendorName\": \"KATH FUEL OIL SERVICE CO\",\n  \"VendorNameLogo\": null,\n  \"VendorTaxId\": null,\n  \"Job\": null,\n  \"RetDelFee\": null,\n  \"Items\": [\n    {\n      \"LineNum\": 1,\n      \"Name\": \"ULS DYED NORDIC B35\",\n      \"Quantity\": 209.5,\n      \"ProductCode\": \"92335\",\n      \"UnitPrice\": 3.41000,\n      \"Amount\": 714.40,\n      \"Description\": \"ULS DYED NORDIC B35\",\n      \"Tax\": 66.09,\n      \"Unit\": \"GAL\"\n    },\n    {\n      \"LineNum\": 2,\n      \"Name\": \"MN INSP FEE&FED ENVO .0029\",\n      \"Quantity\": 209.5,\n      \"ProductCode\": null,\n      \"UnitPrice\": 0.00670,\n      \"Amount\": 1.40,\n      \"Description\": \"MN INSP FEE&FED ENVO .0029\",\n      \"Tax\": null,\n      \"Unit\": null\n    },\n    {\n      \"LineNum\": 3,\n      \"Name\": \"MN STATE SALES TAX 6.875%\",\n      \"Quantity\": null,\n      \"ProductCode\": null,\n      \"UnitPrice\": \"6.87500%\",\n      \"Amount\": 49.12,\n      \"Description\": \"MN STATE SALES TAX 6.875%\",\n      \"Tax\": 49.12,\n      \"Unit\": null\n    },\n    {\n      \"LineNum\": 4,\n      \"Name\": \"MPLS CITY TAX .5%\",\n      \"Quantity\": null,\n      \"ProductCode\": null,\n      \"UnitPrice\": \"0.50000%\",\n      \"Amount\": 3.57,\n      \"Description\": \"MPLS CITY TAX .5%\",\n      \"Tax\": 3.57,\n      \"Unit\": null\n    },\n    {\n      \"LineNum\": 5,\n      \"Name\": \"FED LUST TAX $.001\",\n      \"Quantity\": 209.5,\n      \"ProductCode\": null,\n      \"UnitPrice\": 0.00100,\n      \"Amount\": 0.21,\n      \"Description\": \"FED LUST TAX $.001\",\n      \"Tax\": 0.21,\n      \"Unit\": null\n    },\n    {\n      \"LineNum\": 6,\n      \"Name\": \"HENNEPIN CO SLS TX .15%\",\n      \"Quantity\": null,\n      \"ProductCode\": null,\n      \"UnitPrice\": \"0.15000%\",\n      \"Amount\": 1.07,\n      \"Description\": \"HENNEPIN CO SLS TX .15%\",\n      \"Tax\": 1.07,\n      \"Unit\": null\n    },\n    {\n      \"LineNum\": 7,\n      \"Name\": \"MN TRANS IMPV TAX HENN CO\",\n      \"Quantity\": null,\n      \"ProductCode\": null,\n      \"UnitPrice\": \"0.50000%\",\n      \"Amount\": 3.57,\n      \"Description\": \"MN TRANS IMPV TAX HENN CO\",\n      \"Tax\": 3.57,\n      \"Unit\": null\n    },\n    {\n      \"LineNum\": 8,\n      \"Name\": \".75% METRO TRANSPORT TX\",\n      \"Quantity\": null,\n      \"ProductCode\": null,\n      \"UnitPrice\": \"0.75000%\",\n      \"Amount\": 5.36,\n      \"Description\": \".75% METRO TRANSPORT TX\",\n      \"Tax\": 5.36,\n      \"Unit\": null\n    },\n    {\n      \"LineNum\": 9,\n      \"Name\": \".25% METRO HOUSING TX\",\n      \"Quantity\": null,\n      \"ProductCode\": null,\n      \"UnitPrice\": \"0.25000%\",\n      \"Amount\": 1.79,\n      \"Description\": \".25% METRO HOUSING TX\",\n      \"Tax\": 1.79,\n      \"Unit\": null\n    }\n  ]\n}\n```",
    },
  ],
  "stream": True,
  "temperature": 1,
  "max_output_tokens": 32000,
  "top_p": 1,
  "reasoning": {"effort": "medium"}
}

response = requests.post(
  url,
  headers=headers,
  json=payload,
  stream=True,
)

for line in response.iter_lines():
    if line:
        decoded = line.decode("utf-8")
        if decoded.startswith("data: "):
            print(decoded[6:])