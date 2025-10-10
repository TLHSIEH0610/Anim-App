from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class StoryTemplate:
    key: str
    display_name: str
    description: str
    default_age: str
    illustration_style: str
    story_outline: List[Dict[str, str]]


def _outline(text: str, image: str, pose: str) -> Dict[str, str]:
    return {"text": text, "image": image, "pose": pose}


STORY_TEMPLATES: Dict[str, StoryTemplate] = {
    "space_explorer": StoryTemplate(
        key="space_explorer",
        display_name="Space Explorer",
        description="A cheerful journey through the stars with friendly planets and cosmic surprises.",
        default_age="6-8",
        illustration_style="children's book illustration, vibrant space scene, glowing stars, friendly planets, whimsical sci-fi details",
        story_outline=[
            _outline(
                text="{Name} pulls on the shiny space suit and waves to the cheering crew before the rocket launches toward the stars.",
                image="floating in the sapce and a gleaming rocket in the background",
                pose="standing proudly in a space suit, one arm waving",
            ),
            _outline(
                text="Inside the rocket, {they} press colorful buttons while the engines rumble and the Earth grows small below.",
                image="cozy rocket cockpit filled with playful buttons and screens displaying Earth",
                pose="seated at the control panel, one hand reaching to push a glowing button",
            ),
            _outline(
                text="An orange comet offers a glowing crystal map that leads {Name} to a sparkling nebula playground.",
                image="open space with swirling purple nebula clouds, friendly comet offering a treasure map",
                pose="floating weightless, arms extended to accept the crystal from the comet",
            ),
            _outline(
                text="{Name} plays zero-gravity catch with giggling star-friends and shares stories about home.",
                image="cluster of smiling star characters tossing shimmering stardust balls",
                pose="gently drifting with knees bent and arms ready to catch a glowing star-ball",
            ),
            _outline(
                text="With a twirl, {they} plant a friendship flag on a tiny moon before starting the cozy journey back to Earth.",
                image="small moon dotted with flowers, Earth shining in the sky, friendship flag fluttering",
                pose="crouching slightly while placing a flag into the moon soil",
            ),
        ],
    ),
    "forest_friends": StoryTemplate(
        key="forest_friends",
        display_name="Forest Friends",
        description="A gentle woodland adventure filled with animal friends and acts of kindness.",
        default_age="3-5",
        illustration_style="soft watercolor illustration, warm woodland palette, friendly animals, gentle lighting",
        story_outline=[
            _outline(
                text="Morning sunlight peeks through the trees as {Name} ties a red scarf and steps outside the cozy cottage.",
                image="forest clearing with a small cottage, gentle sunrise, tiny birds fluttering",
                pose="standing near a cottage doorway, one hand shading eyes while looking into the forest",
            ),
            _outline(
                text="A shy bunny needs help carrying berries, and {they} cheerfully shares the basket.",
                image="woodland path lined with ferns, bunny offering berries",
                pose="kneeling to share a woven basket with the bunny",
            ),
            _outline(
                text="Together with new friends, {Name} builds a blanket fort where stories and snacks are shared.",
                image="forest clearing with blankets draped between trees, animals gathered",
                pose="sitting cross-legged on a blanket, arms wide inviting friends to join",
            ),
            _outline(
                text="Rain begins to fall, so {they} stretch a leaf umbrella to keep everyone dry while they sing a happy song.",
                image="soft rain among tall trees, large leaf held above crowd of animals",
                pose="standing with one hand raising a giant leaf umbrella over friends",
            ),
            _outline(
                text="The sunset glows as forest friends thank {Name} with a garland of wildflowers and warm hugs.",
                image="sunset clearing, friends presenting a flower garland",
                pose="standing with arms open to receive a flower garland",
            ),
        ],
    ),
    "magic_school": StoryTemplate(
        key="magic_school",
        display_name="Magic School Day",
        description="A whimsical day at a floating academy where lessons come alive.",
        default_age="6-8",
        illustration_style="whimsical illustration, sparkling magical effects, floating classroom, vibrant colors",
        story_outline=[
            _outline(
                text="The school bell chirps like a songbird as {Name} glides up the winding staircase of the floating academy.",
                image="floating castle classroom with glowing staircases and hovering lanterns",
                pose="climbing floating steps, one hand holding a spellbook against the chest",
            ),
            _outline(
                text="Professor Cloudwhirl teaches potions that fizz into rainbow bubbles, and {they} giggle as one tickles their nose.",
                image="potions classroom with swirling rainbow smoke and playful bubbles",
                pose="seated at a desk, leaning forward with a hand outstretched toward a bubbling cauldron",
            ),
            _outline(
                text="In spell practice, {Name} shapes stardust into gentle creatures that dance across the desks.",
                image="classroom with stardust animals twirling above open spellbooks",
                pose="standing with wand extended, soft arc of magic flowing from fingertips",
            ),
            _outline(
                text="Lunch is a picnic on a floating island where sandwiches fly in slow circles waiting to be chosen.",
                image="floating meadow with picnic blankets, levitating sandwiches, friendly students",
                pose="seated on grass reaching up to catch a floating sandwich",
            ),
            _outline(
                text="At sunset, {they} returns home with a glowing badge that promises another magical day tomorrow.",
                image="academy tower silhouetted against sunset, badge sparkling in hand",
                pose="standing at tower balcony, one hand holding badge toward the sky",
            ),
        ],
    ),
    "pirate_adventure": StoryTemplate(
        key="pirate_adventure",
        display_name="Pirate Treasure Voyage",
        description="A brave journey across shimmering seas in search of hidden treasure and new friends.",
        default_age="6-8",
        illustration_style="bold ink-and-watercolor mix, friendly pirate ship, tropical seas, adventurous energy",
        story_outline=[
            _outline(
                text="Captain {Name} checks the treasure map as the Bright Star ship glides out of the harbor at dawn.",
                image="cheerful pirate ship with colorful sails leaving a cozy harbor",
                pose="standing at the ship's bow, map in one hand, the other hand shading eyes",
            ),
            _outline(
                text="Sea sprites point toward a hidden lagoon, and {they} steers the ship with a confident grin.",
                image="sparkling sea with playful sprites guiding the way",
                pose="gripping the ship's wheel, leaning forward with determination",
            ),
            _outline(
                text="On Coral Island, the crew solves a riddle carved into a giant seashell staircase.",
                image="tropical island with coral steps and glowing seashell riddles",
                pose="crouched near the shell, finger tracing letters while friends watch",
            ),
            _outline(
                text="They share the treasure chest with new island friends, filling it with seashell stories instead of gold.",
                image="beachside circle of pirates and islanders exchanging shells and stories",
                pose="seated on sand passing a shimmering shell to a friend",
            ),
            _outline(
                text="As night falls, {Name} promises to return for another adventure under the moonlit waves.",
                image="ship sailing under stars with calm waves and moonlight",
                pose="standing at the stern, waving back toward the island with moon overhead",
            ),
        ],
    ),
    "bedtime_lullaby": StoryTemplate(
        key="bedtime_lullaby",
        display_name="Bedtime Lullaby",
        description="A calm and dreamy journey toward sleep with soft lullabies and gentle stars.",
        default_age="3-5",
        illustration_style="dreamy pastel illustration, glowing fireflies, cozy night tones",
        story_outline=[
            _outline(
                text="{Name} tidies the toy shelf as the moon peeks through the bedroom window, whispering that it's time to rest.",
                image="cozy bedroom with moonlight, tidy shelves, plush toys",
                pose="kneeling beside a toy shelf, placing a stuffed animal gently",
            ),
            _outline(
                text="Fireflies outside hum a lullaby, and {they} listens from the windowsill wrapped in a warm blanket.",
                image="open window with gentle fireflies and soft curtains",
                pose="sitting on a windowsill hugging knees, head tilted toward the glow",
            ),
            _outline(
                text="A friendly cloud floats in carrying a pillow of stardust dreams and a sparkling storybook.",
                image="fluffy cloud entering the room with glowing pillow and book",
                pose="standing beside the bed reaching out to accept the stardust pillow",
            ),
            _outline(
                text="Together with the cloud, {Name} reads a gentle tale that drifts into shimmering constellations above the bed.",
                image="bedside scene with constellations forming above the book",
                pose="lying under a blanket, holding the book open with a soft smile",
            ),
            _outline(
                text="Sleepy eyes close as the moon hums goodnight and the room glows with peaceful dreams.",
                image="moonbeam bathing the room in soft light, plush toys snuggled close",
                pose="curled on side beneath blanket, hands tucked under cheek",
            ),
        ],
    ),
}


def get_template(key: str) -> Optional[StoryTemplate]:
    return STORY_TEMPLATES.get(key)
