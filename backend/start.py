import asyncio
import sys
import uvicorn


async def _serve():
    config = uvicorn.Config("app.main:app", host="0.0.0.0", port=8000)
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    if sys.platform == "win32":
        loop = asyncio.SelectorEventLoop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_serve())
    else:
        asyncio.run(_serve())
