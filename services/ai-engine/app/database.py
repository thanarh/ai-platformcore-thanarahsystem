import logging
import motor.motor_asyncio
from app.config import settings

logger = logging.getLogger(__name__)

client: motor.motor_asyncio.AsyncIOMotorClient = None
db = None


async def init_db():
    global client, db

    uri = settings.mongodb_uri
    try:
        test_client = motor.motor_asyncio.AsyncIOMotorClient(
            uri,
            serverSelectionTimeoutMS=10000,
            connectTimeoutMS=10000,
        )
        await test_client.admin.command("ping")
        client = test_client
        db = client.thanarah_ai
        logger.info("✅ MongoDB connected successfully")
    except Exception as e:
        logger.warning("⚠️  MongoDB not yet reachable — AI engine starting in degraded mode")
        logger.warning("   Add this host's IP to MongoDB Atlas Network Access and restart")
        logger.debug("Connection error: %s", str(e)[:200])
        db = None


def get_db():
    return db
