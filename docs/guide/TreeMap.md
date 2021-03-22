# TreeMap

[参考](https://my.oschina.net/u/4364289/blog/4174438)

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
    /**
    *   根节点
    */
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
        // 如果 TreeMap 刚初始化（size==0） putAll元素大小也不为空 并且是 SortedMap的实现类才走下面逻辑
        // 否则就调用put 一个个慢慢插入节点
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
        // 实际调用 put方法
        super.putAll(map);
    }
```

### put

```java
    public V put(K key, V value) {
        Entry<K,V> t = root;
        // 如果根节点为空
        if (t == null) {
            // 判断比较器可用或者key自身是可以比较的（实现Comparable）
            compare(key, key); // type (and possibly null) check
            // 创建根节点
            root = new Entry<>(key, value, null);
            // size赋值
            size = 1;
            // 修改次数递增，然后返回null
            modCount++;
            return null;
        }
        int cmp;
        Entry<K,V> parent;
        // split comparator and comparable paths
        // 获取比较器
        Comparator<? super K> cpr = comparator;
        // 如果比较器不为空
        if (cpr != null) {
            // 循环找节点，当t为空的时候结束循环
            do {
                parent = t;
                cmp = cpr.compare(key, t.key);
                if (cmp < 0)
                    t = t.left;
                else if (cmp > 0)
                    t = t.right;
                else
                    // 找到了新值覆盖旧值并且返回旧值
                    return t.setValue(value);
            } while (t != null);
        }
        else {
            // 如果比较器为空，那么key不能空否则空指针异常
            if (key == null)
                throw new NullPointerException();
            // 类型强转
            @SuppressWarnings("unchecked")
                Comparable<? super K> k = (Comparable<? super K>) key;
            // 分析同比较器一样
            do {
                parent = t;
                cmp = k.compareTo(t.key);
                if (cmp < 0)
                    t = t.left;
                else if (cmp > 0)
                    t = t.right;
                else
                    return t.setValue(value);
            } while (t != null);
        }
        // 新建Entry对象e
        Entry<K,V> e = new Entry<>(key, value, parent);
        if (cmp < 0)
            parent.left = e;
        else
            parent.right = e;
        // 插入修正
        fixAfterInsertion(e);
        size++;
        modCount++;
        return null;
    }
```

### buildFromSorted

```java
    /**
    *   根据有序数据建造红黑树
    */
    private void buildFromSorted(int size, Iterator<?> it,
                                 java.io.ObjectInputStream str,
                                 V defaultVal)
        throws  java.io.IOException, ClassNotFoundException {
        this.size = size;
        // 建造树 参数解析
        // level起始层级 0
        // 0 有序数据索引起始 0
        // size-1 有序数据索引结束 size-1
        // computeRedLevel(size) 红色节点层级
        // 有序数据集合
        // str 序列化相关 ObjectInputStream
        // defaultVal 默认值
         数据索引区间 [0,size-1]，computeRedLevel(size)红色节点
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
        // 如果hi<lo返回空 参数不正确
        if (hi < lo) return null;
        // (index+end)/2取中位数
        int mid = (lo + hi) >>> 1;
        // 左子树
        Entry<K,V> left  = null;

        // 如果 lo < mid 就递归造第二层左子树 左子树递归完左子树 读取一次iterator 便是字节点的父节点 接着递归造右子树
        // level+1:下一层，mid - 1就是下层左子树索引的结束位置
        // 如果 mid==lo 说明左子树不能再造了 比如：7 8 9中位数就是 8 下次 buildFromSorted lo=7 mid=7 buildLeft结束
        if (lo < mid)
            left = buildFromSorted(level+1, lo, mid - 1, redLevel,
                                   it, str, defaultVal);

        // extract key and/or value from iterator or stream
        K key;
        V value;
        // 如果迭代器不为空
        if (it != null) {
            // 如果参数传来的默认值为空，那么默认从迭代器去取元素
            if (defaultVal==null) {
                // 获取key，value
                Map.Entry<?,?> entry = (Map.Entry<?,?>)it.next();
                key = (K)entry.getKey();
                value = (V)entry.getValue();
            } else {
                // defaultVal不为空就使用defaultVal
                key = (K)it.next();
                value = defaultVal;
            }
        } else { // use stream
            // 如果迭代器为空，那么就使用 java.io.ObjectInputStream读取后为默认值
            key = (K) str.readObject();
            value = (defaultVal != null ? defaultVal : (V) str.readObject());
        }
        // 刚才获取的 k,v 为子节点 或者 同时拥有左右子树 递归形式去获取
        Entry<K,V> middle =  new Entry<>(key, value, null);

        // color nodes in non-full bottommost level red
        // Map.Entry<K,V>默认是黑色 如果level 递增到了 redLevel便把节点设置成红色
        if (level == redLevel)
            middle.color = RED;
        // 如果左节点不为空 middle，left 互相关联
        if (left != null) {
            middle.left = left;
            left.parent = middle;
        }

        // 如果mid <hi递归造右子树 直到 mide==hi
        if (mid < hi) {
            Entry<K,V> right = buildFromSorted(level+1, mid+1, hi, redLevel,
                                               it, str, defaultVal);
            // middle，right互相关联
            middle.right = right;
            right.parent = middle;
        }
        // 递归完成后整个红黑树就造完，使用了二分法，递归 O(log2N)
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

### fixAfterInsertion

插入修正

### fixAfterDeletion

删除修正

### rotateLeft

左旋节点

### rotateRight

右旋节点

### getEntry

根据 key 找到 entry

```java
    final Entry<K,V> getEntry(Object key) {
        // Offload comparator-based version for sake of performance
        // 如果comparator不为空
        if (comparator != null)
            return getEntryUsingComparator(key);
        // 如果key为null 报空指针 所以TreeMap不能put Null
        if (key == null)
            throw new NullPointerException();
        // key 基本数据类型包装累 String，Integer....基本都是实现了Comparable
        @SuppressWarnings("unchecked")
            Comparable<? super K> k = (Comparable<? super K>) key;
        Entry<K,V> p = root;
        // 遍历整个红黑树找节点
        while (p != null) {
            int cmp = k.compareTo(p.key);
            if (cmp < 0)
                p = p.left;
            else if (cmp > 0)
                p = p.right;
            else
                return p;
        }
        // 没找到返回Null
        return null;
    }

    /**
    *   使用比较器获取Entry
    */
    final Entry<K,V> getEntryUsingComparator(Object key) {
        // 强转key
        @SuppressWarnings("unchecked")
            K k = (K) key;
        // 获取比较器
        Comparator<? super K> cpr = comparator;
        if (cpr != null) {
            Entry<K,V> p = root;
            // 遍历整个红黑树找节点
            while (p != null) {
                // 通过比较key
                int cmp = cpr.compare(k, p.key);
                // 找左子树
                if (cmp < 0)
                    p = p.left;
                // 找右子树
                else if (cmp > 0)
                    p = p.right;
                else
                // 相等便返回Entry
                    return p;
            }
        }
        return null;
    }
```

### getFirstEntry

默认升序排序，取最小的值，递归取左子树

```java
    final Entry<K,V> getFirstEntry() {
        Entry<K,V> p = root;
        if (p != null)
            while (p.left != null)
                p = p.left;
        return p;
    }
```

### getLastEntry

默认升序排序，取最大的值，递归取右子树

```java
    final Entry<K,V> getLastEntry() {
        Entry<K,V> p = root;
        if (p != null)
            while (p.right != null)
                p = p.right;
        return p;
    }
```

### successor

二叉树后继节点，中序遍历的后一个节点

- 如果节点有右子树，则该节点的后继节点就是往右子树出发，然后转到右子树的左子树，一直到左子树的左子树为空
- 如果节点没有右子树，则向上寻找父节点，直到父节点的左子树等于当前节点，则该父节点就是后继节点

```java
    static <K,V> TreeMap.Entry<K,V> successor(Entry<K,V> t) {
        // 如果节点为null，返回null
        if (t == null)
            return null;
        // 如果节点的右子树不为null
        else if (t.right != null) {
            Entry<K,V> p = t.right;
            while (p.left != null)
                p = p.left;
            return p;
        } else {
            // 如果节点没有右子树
            // 当前节点的父节点
            Entry<K,V> p = t.parent;
            // 当前节点
            Entry<K,V> ch = t;
            // 一直向上找直到 节点当它的父节点的左子树结束循环
            while (p != null && ch == p.right) {
                ch = p;
                p = p.parent;
            }
            return p;
        }
    }
```
