import sys
import json

def main():
    # Read from stdin
    input_data = sys.stdin.read()
    if not input_data:
        sys.exit(0)

    try:
        payload = json.loads(input_data)
        
        # We are hooking into PreToolUse
        tool_name = payload.get("tool")
        args = payload.get("args", {})

        if tool_name == "my_bash_tool":
            # Example: Intercept and block rm -rf
            command = args.get("command", "")
            if "rm -rf" in command:
                # Return block signal to stdout
                print(json.dumps({
                    "block": True,
                    "reason": "Execution of rm -rf is strictly prohibited by security python hook."
                }))
                sys.exit(0)
            
            # Example: Mutate arguments before execution
            if "echo" in command:
                args["command"] = command + " (intercepted by Python hook!)"
                print(json.dumps({
                    "args": args
                }))
                sys.exit(0)
        
        # Output nothing or empty json if no mutations
        print("{}")
            
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
