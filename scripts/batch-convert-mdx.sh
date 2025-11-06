#!/bin/bash

# List of simple MDX files to convert (excluding Index.mdx and QuickStart.mdx)
SIMPLE_FILES=(
    "AdvancedFeatures"
    "Blog"
    "CliReference"
    "ContextAndSchemaGuide"
    "Documentation"
    "EdgeConditions"
    "Events"
    "Examples"
    "ExamplesIndex"
    "Faq"
    "GenerativeTesting"
    "GrammarReference"
    "Installation"
    "Integration"
    "LangiumQuickstart"
    "LanguageOverview"
    "Libraries"
    "LlmClientUsage"
    "MetaProgramming"
    "RailsBasedArchitecture"
    "Support"
    "SyntaxGuide"
    "TestingApproach"
    "Troubleshooting"
    "ValidationErrorHandling"
    "VscodeExtension"
)

cd /home/runner/work/machine/machine

for file in "${SIMPLE_FILES[@]}"; do
    MDX_FILE="docs/${file}.mdx"
    MD_FILE="docs/${file}.md"

    if [ -f "$MDX_FILE" ]; then
        echo "Converting $MDX_FILE..."

        # Extract title from PageLayout
        TITLE=$(grep -oP 'title="\K[^"]+' "$MDX_FILE" | head -1)

        # Remove imports, PageLayout tags, and extract content
        sed '/^import /d' "$MDX_FILE" | \
        sed '/^<PageLayout/d' | \
        sed '/^<\/PageLayout>$/d' | \
        sed '/^$/N;/^\n$/D' > "$MD_FILE"

        # Add title as h1 if not already present
        if [ -n "$TITLE" ] && ! head -1 "$MD_FILE" | grep -q "^#"; then
            echo -e "# $TITLE\n" | cat - "$MD_FILE" > temp && mv temp "$MD_FILE"
        fi

        echo "✓ Created $MD_FILE"
    fi
done

echo ""
echo "Conversion complete!"
