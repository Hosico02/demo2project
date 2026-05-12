# Deliberately rough python demo: no tests, no error handling, mixed concerns,
# secrets-looking-string inline (not real but flag-worthy by scorer).
import os
import json

ITEMS = []

def add(x):
    ITEMS.append(x)
    return len(ITEMS)

def serve():
    # business + IO mixed
    add("hello")
    add("world")
    print(json.dumps(ITEMS))

def main():
    # No try/except, no config layer, no logging.
    serve()

if __name__ == "__main__":
    main()
