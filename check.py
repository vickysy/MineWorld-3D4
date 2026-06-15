with open("game3d.html", "r") as f:
    text = f.read()

start = text.find("<script>")
end = text.find("</script>")
script = text[start+8:end]

lines = script.split("\n")

stack = []
for i, line in enumerate(lines):
    for col, char in enumerate(line):
        if char in "{[(":
            stack.append((i+start+2, col+1, char))
        elif char in "}])":
            if not stack:
                print(f"Extra {char} at line {i+start+2}:{col+1}: {line}")
            else:
                last_line, last_col, last_char = stack.pop()
                expected = ""
                if char == "}": expected = "{"
                if char == "]": expected = "["
                if char == ")": expected = "("
                if last_char != expected:
                    print(f"Mismatch at line {i+start+2}:{col+1}: found {char}, expected closing for {last_char} from line {last_line}")
                    stack.append((last_line, last_col, last_char)) # put it back

if stawith open("game3d.html", "r") as f:
    text se    text = f.read()

start = text.
E
start = text.findy