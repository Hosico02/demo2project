import sys
def main():
    print("hi" if len(sys.argv) < 2 else sys.argv[1])
if __name__ == "__main__":
    main()
