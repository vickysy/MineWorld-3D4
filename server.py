import asyncio
import websockets
import json
import uuid

# Store connected clients: {websocket: player_id}
connected_clients = {}

async def broadcast(message, exclude=None):
    if not connected_clients:
        return
    
    # Broadcast to all clients except the sender
    message_str = json.dumps(message)
    tasks = []
    for ws in connected_clients.keys():
        if ws != exclude:
            tasks.append(asyncio.create_task(ws.send(message_str)))
    
    if tasks:
        await asyncio.gather(*tasks)

async def handler(websocket):
    player_id = str(uuid.uuid4())
    connected_clients[websocket] = player_id
    
    print(f"Player joined: {player_id}")
    
    try:
        # Tell the player their ID
        await websocket.send(json.dumps({"type": "init", "id": player_id}))
        
        # Notify others that a new player joined
        await broadcast({"type": "join", "id": player_id}, exclude=websocket)
        
        async for message in websocket:
            try:
                data = json.loads(message)
                
                if data["type"] == "pos":
                    # Broadcast position to others
                    await broadcast({
                        "type": "pos",
                        "id": player_id,
                        "x": data.get("x"),
                        "y": data.get("y"),
                        "z": data.get("z"),
                        "ry": data.get("ry") # Just Y rotation is enough for looking around horizontally
                    }, exclude=websocket)
                    
                elif data["type"] == "block":
                    # Broadcast block changes (dig/place)
                    await broadcast({
                        "type": "block",
                        "id": player_id,
                        "action": data.get("action"),
                        "x": data.get("x"),
                        "y": data.get("y"),
                        "z": data.get("z"),
                        "blockType": data.get("blockType")
                    }, exclude=websocket)
                    
            except json.JSONDecodeError:
                pass
                
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        # Player left
        print(f"Player left: {player_id}")
        del connected_clients[websocket]
        await broadcast({"type": "leave", "id": player_id})

async def main():
    print("Minecraft Multiplayer Server running on ws://0.0.0.0:8081")
    async with websockets.serve(handler, "0.0.0.0", 8081):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())