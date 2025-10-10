from __future__ import annotations

import json


BASE_STYLE = (
    "Genrih Valk illustration, children's book illustration, watercolor style, "
    "soft pastel colors, whimsical art, storybook character, friendly cartoon style, "
    "hand-drawn illustration, warm lighting, child-friendly art style"
)


DEFAULT_STORIES = [
    {
        "slug": "space_explorer",
        "name": "Space Explorer",
        "description": "A cheerful journey through the stars with friendly planets and cosmic surprises.",
        "default_age": "6-8",
        "illustration_style": "children's book illustration, vibrant space scene, glowing stars, friendly planets, whimsical sci-fi details",
        "pages": [
            {
                "story_text": "{Name} pulls on the shiny space suit and waves to the cheering crew before the rocket launches toward the stars.",
                "image_prompt": "floating in the sapce and a gleaming rocket in the background",
                "pose_prompt": "standing proudly in a space suit, one arm waving",
            },
            {
                "story_text": "Inside the rocket, {they} press colorful buttons while the engines rumble and the Earth grows small below.",
                "image_prompt": "cozy rocket cockpit filled with playful buttons and screens displaying Earth",
                "pose_prompt": "seated at the control panel, one hand reaching to push a glowing button",
            },
            {
                "story_text": "An orange comet offers a glowing crystal map that leads {Name} to a sparkling nebula playground.",
                "image_prompt": "open space with swirling purple nebula clouds, friendly comet offering a treasure map",
                "pose_prompt": "floating weightless, arms extended to accept the crystal from the comet",
            },
            {
                "story_text": "{Name} plays zero-gravity catch with giggling star-friends and shares stories about home.",
                "image_prompt": "cluster of smiling star characters tossing shimmering stardust balls",
                "pose_prompt": "gently drifting with knees bent and arms ready to catch a glowing star-ball",
            },
            {
                "story_text": "With a twirl, {they} plant a friendship flag on a tiny moon before starting the cozy journey back to Earth.",
                "image_prompt": "small moon dotted with flowers, Earth shining in the sky, friendship flag fluttering",
                "pose_prompt": "crouching slightly while placing a flag into the moon soil",
            },
        ],
    },
    {
        "slug": "forest_friends",
        "name": "Forest Friends",
        "description": "A gentle woodland adventure filled with animal friends and acts of kindness.",
        "default_age": "3-5",
        "illustration_style": "soft watercolor illustration, warm woodland palette, friendly animals, gentle lighting",
        "pages": [
            {
                "story_text": "Morning sunlight peeks through the trees as {Name} ties a red scarf and steps outside the cozy cottage.",
                "image_prompt": "forest clearing with a small cottage, gentle sunrise, tiny birds fluttering",
                "pose_prompt": "standing near a cottage doorway, one hand shading eyes while looking into the forest",
            },
            {
                "story_text": "A shy bunny needs help carrying berries, and {they} cheerfully shares the basket.",
                "image_prompt": "woodland path lined with ferns, bunny offering berries",
                "pose_prompt": "kneeling to share a woven basket with the bunny",
            },
            {
                "story_text": "Together with new friends, {Name} builds a blanket fort where stories and snacks are shared.",
                "image_prompt": "forest clearing with blankets draped between trees, animals gathered",
                "pose_prompt": "sitting cross-legged on a blanket, arms wide inviting friends to join",
            },
            {
                "story_text": "Rain begins to fall, so {they} stretch a leaf umbrella to keep everyone dry while they sing a happy song.",
                "image_prompt": "soft rain among tall trees, large leaf held above crowd of animals",
                "pose_prompt": "standing with one hand raising a giant leaf umbrella over friends",
            },
            {
                "story_text": "The sunset glows as forest friends thank {Name} with a garland of wildflowers and warm hugs.",
                "image_prompt": "sunset clearing, friends presenting a flower garland",
                "pose_prompt": "standing with arms open to receive a flower garland",
            },
        ],
    },
    {
        "slug": "magic_school",
        "name": "Magic School Day",
        "description": "A whimsical day at a floating academy where lessons come alive.",
        "default_age": "6-8",
        "illustration_style": "whimsical illustration, sparkling magical effects, floating classroom, vibrant colors",
        "pages": [
            {
                "story_text": "The school bell chirps like a songbird as {Name} glides up the winding staircase of the floating academy.",
                "image_prompt": "floating castle classroom with glowing staircases and hovering lanterns",
                "pose_prompt": "climbing floating steps, one hand holding a spellbook against the chest",
            },
            {
                "story_text": "Professor Cloudwhirl teaches potions that fizz into rainbow bubbles, and {they} giggle as one tickles their nose.",
                "image_prompt": "potions classroom with swirling rainbow smoke and playful bubbles",
                "pose_prompt": "seated at a desk, leaning forward with a hand outstretched toward a bubbling cauldron",
            },
            {
                "story_text": "In spell practice, {Name} shapes stardust into gentle creatures that dance across the desks.",
                "image_prompt": "classroom with stardust animals twirling above open spellbooks",
                "pose_prompt": "standing with wand extended, soft arc of magic flowing from fingertips",
            },
            {
                "story_text": "Lunch is a picnic on a floating island where sandwiches fly in slow circles waiting to be chosen.",
                "image_prompt": "floating meadow with picnic blankets, levitating sandwiches, friendly students",
                "pose_prompt": "seated on grass reaching up to catch a floating sandwich",
            },
            {
                "story_text": "At sunset, {they} returns home with a glowing badge that promises another magical day tomorrow.",
                "image_prompt": "academy tower silhouetted against sunset, badge sparkling in hand",
                "pose_prompt": "standing at tower balcony, one hand holding badge toward the sky",
            },
        ],
    },
    {
        "slug": "pirate_adventure",
        "name": "Pirate Treasure Voyage",
        "description": "A brave journey across shimmering seas in search of hidden treasure and new friends.",
        "default_age": "6-8",
        "illustration_style": "bold ink-and-watercolor mix, friendly pirate ship, tropical seas, adventurous energy",
        "pages": [
            {
                "story_text": "Captain {Name} checks the treasure map as the Bright Star ship glides out of the harbor at dawn.",
                "image_prompt": "cheerful pirate ship with colorful sails leaving a cozy harbor",
                "pose_prompt": "standing at the ship's bow, map in one hand, the other hand shading eyes",
            },
            {
                "story_text": "Sea sprites point toward a hidden lagoon, and {they} steers the ship with a confident grin.",
                "image_prompt": "sparkling sea with playful sprites guiding the way",
                "pose_prompt": "gripping the ship's wheel, leaning forward with determination",
            },
            {
                "story_text": "On Coral Island, the crew solves a riddle carved into a giant seashell staircase.",
                "image_prompt": "tropical island with coral steps and glowing seashell riddles",
                "pose_prompt": "crouched near the shell, finger tracing letters while friends watch",
            },
            {
                "story_text": "They share the treasure chest with new island friends, filling it with seashell stories instead of gold.",
                "image_prompt": "beachside circle of pirates and islanders exchanging shells and stories",
                "pose_prompt": "seated on sand passing a shimmering shell to a friend",
            },
            {
                "story_text": "As night falls, {Name} promises to return for another adventure under the moonlit waves.",
                "image_prompt": "ship sailing under stars with calm waves and moonlight",
                "pose_prompt": "standing at the stern, waving back toward the island with moon overhead",
            },
        ],
    },
    {
        "slug": "bedtime_lullaby",
        "name": "Bedtime Lullaby",
        "description": "A calm and dreamy journey toward sleep with soft lullabies and gentle stars.",
        "default_age": "3-5",
        "illustration_style": "dreamy pastel illustration, glowing fireflies, cozy night tones",
        "pages": [
            {
                "story_text": "{Name} tidies the toy shelf as the moon peeks through the bedroom window, whispering that it's time to rest.",
                "image_prompt": "cozy bedroom with moonlight, tidy shelves, plush toys",
                "pose_prompt": "kneeling beside a toy shelf, placing a stuffed animal gently",
            },
            {
                "story_text": "Fireflies outside hum a lullaby, and {they} listens from the windowsill wrapped in a warm blanket.",
                "image_prompt": "open window with gentle fireflies and soft curtains",
                "pose_prompt": "sitting on a windowsill hugging knees, head tilted toward the glow",
            },
            {
                "story_text": "A friendly cloud floats in carrying a pillow of stardust dreams and a sparkling storybook.",
                "image_prompt": "fluffy cloud entering the room with glowing pillow and book",
                "pose_prompt": "standing beside the bed reaching out to accept the stardust pillow",
            },
            {
                "story_text": "Together with the cloud, {Name} reads a gentle tale that drifts into shimmering constellations above the bed.",
                "image_prompt": "bedside scene with constellations forming above the book",
                "pose_prompt": "lying under a blanket, holding the book open with a soft smile",
            },
            {
                "story_text": "Sleepy eyes close as the moon hums goodnight and the room glows with peaceful dreams.",
                "image_prompt": "moonbeam bathing the room in soft light, plush toys snuggled close",
                "pose_prompt": "curled on side beneath blanket, hands tucked under cheek",
            },
        ],
    },
]


def ensure_default_stories(session_factory):
    from app.models import StoryTemplate, StoryTemplatePage  # local import to avoid circular

    session = session_factory()
    try:
        existing = session.query(StoryTemplate).count()
        if existing:
            return

        for story in DEFAULT_STORIES:
            template = StoryTemplate(
                slug=story["slug"],
                name=story["name"],
                description=story["description"],
                default_age=story["default_age"],
                illustration_style=story["illustration_style"],
                workflow_slug="base",
                is_active=True,
            )
            session.add(template)
            session.flush()

            for index, page in enumerate(story["pages"], start=1):
                positive = (
                    f"{BASE_STYLE}, {story['illustration_style']}, {page['image_prompt']}"
                )
                page_row = StoryTemplatePage(
                    story_template_id=template.id,
                    page_number=index,
                    story_text=page["story_text"],
                    image_prompt=page["image_prompt"],
                    positive_prompt=positive,
                    pose_prompt=page["pose_prompt"],
                )
                session.add(page_row)

        session.commit()
    finally:
        session.close()
