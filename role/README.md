# 角色配置说明

这个文件夹用于存放不同角色的配置信息。每个角色一个文件夹，文件夹内包含 `character.json` 配置文件。

## 文件夹结构

```
role/
├── miku/              # 角色文件夹名（英文，作为角色ID）
│   └── character.json # 角色配置文件
├── rem/
│   └── character.json
└── asuna/
    └── character.json
```

## 角色配置文件格式 (character.json)

```json
{
  "name": "角色名称（中文）",
  "nickname": "昵称（英文）",
  "description": "角色简短描述",
  "personality": [
    "性格特点1",
    "性格特点2"
  ],
  "background": "角色背景故事",
  "speaking_style": [
    "说话风格1",
    "说话风格2"
  ],
  "example_dialogues": [
    {
      "user": "用户输入示例",
      "assistant": "角色回复示例"
    }
  ],
  "system_prompt": "完整的系统提示词，用于引导AI扮演该角色"
}
```

## 如何添加新角色

1. 在 `role` 文件夹下创建新的角色文件夹（使用英文名称）
2. 在角色文件夹内创建 `character.json` 文件
3. 按照上述格式填写角色信息
4. 重启应用，新角色会自动出现在角色选择列表中

## 字段说明

- **name**: 角色的中文名称，会显示在UI上
- **nickname**: 角色的英文昵称或缩写
- **description**: 角色的简短描述（1-2句话）
- **personality**: 角色的性格特点列表
- **background**: 角色的背景故事，帮助AI理解角色设定
- **speaking_style**: 角色说话的风格特点
- **example_dialogues**: 示例对话，让AI学习角色的对话风格（建议3-5条）
- **system_prompt**: 最重要的字段！这是发送给AI的系统提示词，需要详细描述角色的所有特征

## 示例角色

- **miku**: 初音未来 - 活泼开朗的虚拟歌姬
- **rem**: 雷姆 - 温柔体贴的女仆
- **asuna**: 亚丝娜 - 勇敢坚强的剑士

你可以参考这些示例来创建自己的角色！

