# TreeMap

TreeMap 的实现是红黑树算法的实现

:::tip 红黑树特性

- 是一颗 BST
- 每个节点要么红的，要么是黑的
- 根节点是黑的，并且定义 NULL 为黑的
- 如果一个节点是红色的，那么它的俩儿子都是黑色的，并且父节点是黑色的
- 对于任一节点而言，它到叶节点的每条路径都包含相同数目的黑色节点，称为黑高

:::

```java
public class TreeMap<K,V>
    extends AbstractMap<K,V>
    implements NavigableMap<K,V>, Cloneable, java.io.Serializable{

    /**
     *  key排序比较器
     */
    private final Comparator<? super K> comparator;
    // 根节点
    private transient Entry<K,V> root;

    /**
     * 树的元素数量
     * The number of entries in the tree
     */
    private transient int size = 0;

    /**
     * 当前树被修改次数
     * The number of structural modifications to the tree.
     */
    private transient int modCount = 0;
}
```

## 方法

### putAll

```java
    public void putAll(Map<? extends K, ? extends V> map) {
        // 获取map的元素大小
        int mapSize = map.size();
        // 如果 TreeMap 刚初始化 putAll元素大小也不为空 并且是 SortedMap的实现类
        if (size==0 && mapSize!=0 && map instanceof SortedMap) {
            // 获取map的比较器
            Comparator<?> c = ((SortedMap<?,?>)map).comparator();
            // 如果map的比较器与treeMap的比较器是相同的内存地址
            // 或者是map与treeMap的comparator相同(重写了equals方法)
            if (c == comparator || (c != null && c.equals(comparator))) {
                // 次数加1
                ++modCount;
                try {
                    buildFromSorted(mapSize, map.entrySet().iterator(),
                                    null, null);
                } catch (java.io.IOException cannotHappen) {
                } catch (ClassNotFoundException cannotHappen) {
                }
                return;
            }
        }
        super.putAll(map);
    }
```

### buildFromSorted

```java

    private void buildFromSorted(int size, Iterator<?> it,
                                 java.io.ObjectInputStream str,
                                 V defaultVal)
        throws  java.io.IOException, ClassNotFoundException {
        this.size = size;
        root = buildFromSorted(0, 0, size-1, computeRedLevel(size),
                               it, str, defaultVal);
    }

    private final Entry<K,V> buildFromSorted(int level, int lo, int hi,
                                             int redLevel,
                                             Iterator<?> it,
                                             java.io.ObjectInputStream str,
                                             V defaultVal)
        throws  java.io.IOException, ClassNotFoundException {
        /*
         * Strategy: The root is the middlemost element. To get to it, we
         * have to first recursively construct the entire left subtree,
         * so as to grab all of its elements. We can then proceed with right
         * subtree.
         *
         * The lo and hi arguments are the minimum and maximum
         * indices to pull out of the iterator or stream for current subtree.
         * They are not actually indexed, we just proceed sequentially,
         * ensuring that items are extracted in corresponding order.
         */

        if (hi < lo) return null;

        int mid = (lo + hi) >>> 1;

        Entry<K,V> left  = null;
        if (lo < mid)
            left = buildFromSorted(level+1, lo, mid - 1, redLevel,
                                   it, str, defaultVal);

        // extract key and/or value from iterator or stream
        K key;
        V value;
        if (it != null) {
            if (defaultVal==null) {
                Map.Entry<?,?> entry = (Map.Entry<?,?>)it.next();
                key = (K)entry.getKey();
                value = (V)entry.getValue();
            } else {
                key = (K)it.next();
                value = defaultVal;
            }
        } else { // use stream
            key = (K) str.readObject();
            value = (defaultVal != null ? defaultVal : (V) str.readObject());
        }

        Entry<K,V> middle =  new Entry<>(key, value, null);

        // color nodes in non-full bottommost level red
        if (level == redLevel)
            middle.color = RED;

        if (left != null) {
            middle.left = left;
            left.parent = middle;
        }

        if (mid < hi) {
            Entry<K,V> right = buildFromSorted(level+1, mid+1, hi, redLevel,
                                               it, str, defaultVal);
            middle.right = right;
            right.parent = middle;
        }

        return middle;
    }
```

### computeRedLevel

它的作用是用来计算完全二叉树红色节点的层数，在构造红黑树的时候，我们只需要最后一层设置成红色，其他层数全是黑色节点便满足红黑树特性。

计算红色节点应该在红黑树哪一层,因为二叉树，因为每层二叉树要填满的话必须是 2 的倍数

每层数据叠加是 1,1+2,1+2+4,1+2+4+8... 基本就是每层就是每层/2

```java
    private static int computeRedLevel(int sz) {
        int level = 0;
        // 从0开始计算满二叉树最后一个元素索引位置为0,2,6,14...
        // 可以看出m=(m+1)*2 前一个和后一个的递推关系 每一层计算
        // 那么反过来就是m/2-1就是上一层的位置，最后一个m>=0的时候还要计算一次
        for (int m = sz - 1; m >= 0; m = m / 2 - 1)
            level++;
        return level;
    }
```
