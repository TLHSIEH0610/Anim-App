import json
import requests
import os
from typing import List, Dict, Optional
from datetime import datetime

class OllamaStoryGenerator:
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        self.model_name = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
        
    def check_model_availability(self) -> bool:
        """Check if Ollama is running and model is available"""
        try:
            response = requests.get(f"{self.base_url}/api/tags")
            if response.status_code == 200:
                models = response.json().get('models', [])
                return any(model['name'] == self.model_name for model in models)
            return False
        except requests.RequestException:
            return False
    
    def generate_story(self, 
                      title: str,
                      theme: str, 
                      age_group: str,
                      page_count: int,
                      character_description: str,
                      positive_prompt: str = "",
                      negative_prompt: str = "") -> Dict:
        """
        Generate a children's story using Ollama
        
        Args:
            title: Book title
            theme: Story theme (adventure, friendship, learning, etc.)
            age_group: Target age (3-5, 6-8, 9-12)
            page_count: Number of pages (8, 12, 16)
            character_description: Description from uploaded image analysis
            positive_prompt: User's positive creative input
            negative_prompt: Things to avoid in the story
        
        Returns:
            Dict with story pages and metadata
        """
        
        # Age-appropriate guidelines
        age_guidelines = {
            "3-5": {
                "vocabulary": "simple words, basic concepts",
                "sentence_length": "1-2 sentences per page maximum",
                "themes": "family, friendship, simple emotions, daily activities",
                "complexity": "very simple plot, clear cause and effect"
            },
            "6-8": {
                "vocabulary": "elementary level, some new words explained in context", 
                "sentence_length": "2-3 sentences per page",
                "themes": "adventure, problem-solving, school, community helpers",
                "complexity": "simple beginning-middle-end structure"
            },
            "9-12": {
                "vocabulary": "more advanced vocabulary, complex emotions",
                "sentence_length": "3-4 sentences per page", 
                "themes": "friendship challenges, personal growth, mild adventure",
                "complexity": "character development, multiple plot points"
            }
        }
        
        guidelines = age_guidelines.get(age_group, age_guidelines["6-8"])
        
        # Build the prompt
        system_prompt = f"""You are an expert children's book author. Create engaging, age-appropriate stories that are safe, educational, and fun.

STRICT REQUIREMENTS:
- Target age: {age_group} years old
- Vocabulary: {guidelines['vocabulary']}
- Sentence length: {guidelines['sentence_length']}
- Appropriate themes: {guidelines['themes']}
- Story complexity: {guidelines['complexity']}

SAFETY GUIDELINES:
- No violence, scary content, or inappropriate themes
- Promote positive values like kindness, courage, friendship
- Avoid content mentioned in negative prompt: {negative_prompt}
- Keep content wholesome and educational

OUTPUT FORMAT:
You must respond with valid JSON only, no other text. Use this exact structure:
{{
    "title": "{title}",
    "pages": [
        {{"page": 1, "text": "story text for page 1", "image_description": "detailed scene description for illustration"}},
        {{"page": 2, "text": "story text for page 2", "image_description": "detailed scene description for illustration"}}
    ],
    "age_group": "{age_group}",
    "theme": "{theme}"
}}"""

        user_prompt = f"""Create a {page_count}-page children's story with these specifications:

Title: "{title}"
Theme: {theme}
Main character: {character_description}
Creative elements to include: {positive_prompt}
Age group: {age_group}

The story should:
1. Have a clear beginning, middle, and end
2. Feature the main character from the uploaded image
3. Incorporate the theme of {theme}
4. Include elements from: {positive_prompt}
5. Be exactly {page_count} pages long
6. Each page should have both text and a detailed image description

Make the image descriptions vivid and detailed so an artist can create beautiful illustrations. Focus on colors, emotions, settings, and character expressions."""

        try:
            # Make request to Ollama
            payload = {
                "model": self.model_name,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "num_predict": 2048
                }
            }
            
            response = requests.post(
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=120  # 2 minutes timeout
            )
            
            if response.status_code != 200:
                raise Exception(f"Ollama API error: {response.status_code} - {response.text}")
            
            result = response.json()
            content = result['message']['content']
            
            # Try to parse JSON response
            try:
                story_data = json.loads(content)
            except json.JSONDecodeError:
                # If JSON parsing fails, try to extract JSON from the response
                import re
                json_match = re.search(r'\{.*\}', content, re.DOTALL)
                if json_match:
                    story_data = json.loads(json_match.group())
                else:
                    raise Exception("Could not parse story JSON from Ollama response")
            
            # Validate the response structure
            if not self._validate_story_structure(story_data, page_count):
                raise Exception("Generated story doesn't match required structure")
            
            # Add metadata
            story_data['generated_at'] = datetime.now().isoformat()
            story_data['generator'] = 'ollama'
            story_data['model'] = self.model_name
            
            return story_data
            
        except requests.RequestException as e:
            raise Exception(f"Failed to connect to Ollama: {str(e)}")
        except json.JSONDecodeError as e:
            raise Exception(f"Failed to parse Ollama response as JSON: {str(e)}")
        except Exception as e:
            raise Exception(f"Story generation failed: {str(e)}")
    
    def _validate_story_structure(self, story_data: Dict, expected_pages: int) -> bool:
        """Validate that the generated story has the correct structure"""
        try:
            # Check required fields
            if 'pages' not in story_data or 'title' not in story_data:
                return False
            
            pages = story_data['pages']
            
            # Check page count
            if len(pages) != expected_pages:
                return False
            
            # Check each page structure
            for i, page in enumerate(pages):
                if not isinstance(page, dict):
                    return False
                    
                required_fields = ['page', 'text', 'image_description']
                if not all(field in page for field in required_fields):
                    return False
                
                # Check page number sequence
                if page['page'] != i + 1:
                    return False
                
                # Check that text and image_description are not empty
                if not page['text'].strip() or not page['image_description'].strip():
                    return False
            
            return True
            
        except Exception:
            return False
    
    def generate_fallback_story(self, title: str, character_description: str, page_count: int) -> Dict:
        """Generate a simple fallback story if Ollama fails"""
        return {
            "title": title,
            "pages": [
                {
                    "page": 1,
                    "text": f"Once upon a time, there was a wonderful character named {character_description.split()[0] if character_description else 'Hero'}.",
                    "image_description": f"A friendly character in a magical setting, {character_description}"
                },
                {
                    "page": 2,
                    "text": "They went on an amazing adventure and discovered something special.",
                    "image_description": "The character exploring a colorful, safe environment full of wonder"
                },
                {
                    "page": 3,
                    "text": "Along the way, they made new friends and learned important lessons.",
                    "image_description": "The character meeting friendly animals or other characters in a beautiful scene"
                },
                {
                    "page": 4,
                    "text": "In the end, everyone was happy and they all lived joyfully ever after!",
                    "image_description": "A celebration scene with the character and friends in a bright, cheerful setting"
                }
            ][:page_count],  # Trim to requested page count
            "age_group": "6-8",
            "theme": "adventure",
            "generated_at": datetime.now().isoformat(),
            "generator": "fallback",
            "model": "simple_template"
        }


# Utility function to enhance prompts for children's book images
def enhance_childbook_prompt(
    user_prompt: str,
    story_theme: str,
    age_group: str,
    page_context: str = "",
    character_description: str = "",
) -> Dict[str, str]:
    """
    Enhance user prompts to be appropriate for children's book illustrations
    
    Args:
        user_prompt: Original image description from story
        story_theme: Theme of the story (adventure, friendship, etc.)
        age_group: Target age group
        page_context: Additional context about this specific page
    
    Returns:
        Dict with enhanced positive and negative prompts
    """
    
    # Base children's book illustration style
    base_positive = "children's book illustration, colorful, friendly, safe, wholesome, "
    
    # Age-specific visual adjustments
    age_modifiers = {
        "3-5": "simple shapes, bright primary colors, large friendly characters, cartoonish style, ",
        "6-8": "detailed illustrations, vibrant colors, adventure elements, diverse characters, storybook art, ",
        "9-12": "sophisticated artwork, rich colors, detailed backgrounds, realistic proportions, narrative illustration, "
    }
    
    # Theme-specific visual elements
    theme_modifiers = {
        "adventure": "exciting landscapes, journey elements, exploration, discovery, ",
        "friendship": "warm interactions, group activities, cooperation, sharing, ",
        "learning": "educational elements, discovery, curiosity, problem-solving, ",
        "bedtime": "soft colors, calm atmosphere, peaceful scenes, gentle lighting, ",
        "fantasy": "magical elements, wonder, sparkles, enchanted settings, "
    }
    
    # Build enhanced positive prompt
    enhanced_positive = (
        base_positive +
        age_modifiers.get(age_group, age_modifiers["6-8"]) +
        theme_modifiers.get(story_theme, "") +
        f"{user_prompt}, {page_context}, " +
        "professional children's book art, published quality, digital painting"
    )

    if character_description and character_description.strip():
        enhanced_positive = f"{character_description.strip()}, {enhanced_positive}" 
    
    # Comprehensive negative prompt for child safety
    negative_prompt = (
        "scary, frightening, dark, violent, weapons, blood, death, monsters, "
        "inappropriate content, adult themes, complex text, small text, "
        "unclear faces, distorted anatomy, low quality, blurry, "
        "photorealistic, photography, black and white, monochrome"
    )
    
    return {
        "positive": enhanced_positive.strip(),
        "negative": negative_prompt.strip()
    }


# Test function for development
def test_story_generation():
    """Test the story generation system"""
    generator = OllamaStoryGenerator()
    
    if not generator.check_model_availability():
        print(f"Warning: Ollama model {generator.model_name} not available")
        return
    
    try:
        story = generator.generate_story(
            title="The Magic Garden",
            theme="adventure", 
            age_group="6-8",
            page_count=4,
            character_description="a curious young girl with brown hair wearing a blue dress",
            positive_prompt="flowers, butterflies, magical elements",
            negative_prompt="scary animals, dark places"
        )
        
        print("✅ Story generation successful!")
        print(f"Title: {story['title']}")
        print(f"Pages: {len(story['pages'])}")
        for page in story['pages']:
            print(f"Page {page['page']}: {page['text'][:50]}...")
            
    except Exception as e:
        print(f"❌ Story generation failed: {e}")


if __name__ == "__main__":
    test_story_generation()
